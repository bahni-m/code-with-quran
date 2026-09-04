'use strict';

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const quran = require('./quran');
const qt = require('./quran-text');
const { loadState, position } = require('./state');
const { openUrl } = require('./open');
const registry = require('./web-registry');

/*
 * The bundled web reader.
 *
 * A terminal grid can't lay out right-to-left Arabic reliably — tmux has no bidi
 * engine and terminals disagree — so the honest place to *read* is a browser,
 * where RTL is a solved problem. This is a zero-dependency local HTTP server
 * that serves the bundled Uthmani text as one quiet page and advances in step
 * with the state file, exactly like the TUI reader.
 *
 * Bound to 127.0.0.1 only. Deduped through web-registry.js: the first
 * `claude --cwq` starts it, later ones reuse it. Shuts itself down once no
 * request has arrived for `idleMs` (i.e. the last browser tab closed).
 */

const DEFAULT_PORT = 7620;
const PORT_SCAN = 16; // ports to try before giving up
const DEFAULT_SPAN = 3; // ayat shown on each side of the current one
const DEFAULT_IDLE_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 5000;

/* ─── data ─────────────────────────────────────────────────────────────── */

/** The current ayah plus `span` neighbours on each side (wraps 114:6 → 1:1). */
function collectAyat(pos, span) {
  const ayat = [];
  for (let d = -span; d <= span; d++) {
    const p =
      d === 0 ? pos : d < 0 ? quran.rewind(pos, -d, true) : quran.advance(pos, d, true);
    // a wrapped duplicate (near the very start/end of the Qur'an) — skip it
    if (d !== 0 && p.surah === pos.surah && p.ayah === pos.ayah) continue;
    ayat.push({
      surah: p.surah,
      ayah: p.ayah,
      ref: `${p.surah}:${p.ayah}`,
      text: qt.ayahText(p.surah, p.ayah),
      numeral: qt.toArabicDigits(p.ayah),
      current: d === 0,
    });
  }
  return ayat;
}

/**
 * Everything the page needs for one render, as plain data.
 * Pure — reads the state file, touches nothing else.
 * @param {number} [span]  ayat to include on each side of the current one
 */
function frameData(span = DEFAULT_SPAN) {
  const pos = position(loadState());
  const s = quran.surah(pos.surah);
  const idx = quran.absoluteIndex(pos);

  return {
    position: pos,
    ref: `${pos.surah}:${pos.ayah}`,
    surah: {
      number: s.number,
      name: s.name,
      meaning: s.meaning,
      arabic: s.arabic,
      revelationPlace: s.revelationPlace,
      ayahs: s.ayahs,
    },
    basmalah: pos.ayah === 1 && qt.hasOpeningBasmalah(pos.surah) ? qt.BASMALAH : null,
    ayat: collectAyat(pos, span),
    progress: {
      index: idx,
      total: quran.TOTAL_AYAT,
      percent: Math.round((idx / quran.TOTAL_AYAT) * 1000) / 10,
    },
  };
}

/* ─── the page ─────────────────────────────────────────────────────────── */

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>code-with-quran</title>
<style>
  :root {
    --bg: #faf8f3; --ink: #2b2621; --dim: #b6ac9b; --rule: #e7e0d2; --accent: #7d6f57;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14120f; --ink: #ede6d8; --dim: #6b6353; --rule: #2a261f; --accent: #b7a374; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center;
    padding: 5vh 20px 4vh; min-height: 100%;
  }
  #wrap { width: 100%; max-width: 720px; margin: auto 0; text-align: center; }
  header { color: var(--dim); font-size: 13px; letter-spacing: .02em; margin-bottom: 2.4rem; }
  header .ar { font-size: 15px; color: var(--accent); }
  .basmalah {
    font-family: "SF Arabic", "Geeza Pro", "Noto Naskh Arabic", "Amiri", "Scheherazade New", serif;
    direction: rtl; color: var(--dim); font-size: 1.3rem; margin-bottom: 2rem;
  }
  .ayah {
    font-family: "SF Arabic", "Geeza Pro", "Noto Naskh Arabic", "Amiri", "Scheherazade New", "Traditional Arabic", serif;
    direction: rtl; text-align: center; margin: 1.15rem 0;
    color: var(--dim); font-size: 1.15rem; line-height: 2.05;
    transition: color .4s, opacity .4s;
  }
  .ayah.current { color: var(--ink); font-size: 2rem; line-height: 2.1; margin: 1.9rem 0; }
  .ayah .n {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 1.7em; height: 1.7em; padding: 0 .3em; margin: 0 .45em;
    border: 1px solid var(--accent); border-radius: 999px;
    font-size: .5em; line-height: 1; color: var(--accent);
    vertical-align: .35em; unicode-bidi: isolate;
  }
  #ayat { transition: opacity .35s; }
  footer { margin-top: 2.6rem; color: var(--dim); font-size: 12px; }
  .meter { height: 3px; background: var(--rule); border-radius: 3px; overflow: hidden; margin: .8rem auto 0; max-width: 260px; }
  .meter > i { display: block; height: 100%; background: var(--accent); transition: width .5s; }
  .count { margin-top: .55rem; }
  #wrap.stale { opacity: .4; }
</style>
</head>
<body>
<div id="wrap" aria-live="polite">
  <header id="head"></header>
  <div id="basmalah" class="basmalah" hidden></div>
  <div id="ayat"></div>
  <footer>
    <div>follows your Claude Code session — each prompt moves one ayah</div>
    <div class="meter"><i id="bar"></i></div>
    <div class="count" id="count"></div>
  </footer>
</div>
<script>
  var lastRef = null, missed = 0;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function render(d) {
    var s = d.surah;
    $('head').innerHTML =
      '<span class="ar">' + esc(s.arabic) + '</span> &nbsp;·&nbsp; ' +
      esc(s.name) + ' &nbsp;·&nbsp; ' + esc(s.meaning) + ' &nbsp;·&nbsp; ' + esc(s.revelationPlace);

    var bas = $('basmalah');
    if (d.basmalah) { bas.textContent = d.basmalah; bas.hidden = false; }
    else { bas.hidden = true; }

    var ayat = $('ayat');
    ayat.style.opacity = 0;
    ayat.innerHTML = d.ayat.map(function (a) {
      return '<div class="ayah' + (a.current ? ' current' : '') + '">' +
        esc(a.text) + '<span class="n">' + esc(a.numeral) + '</span></div>';
    }).join('');
    requestAnimationFrame(function () { ayat.style.opacity = 1; });

    $('bar').style.width = d.progress.percent + '%';
    $('count').textContent =
      d.progress.index + ' / ' + d.progress.total + '  ·  ' + d.progress.percent + '%';
    document.title = s.name + ' ' + d.ref + ' · code-with-quran';
  }

  function poll() {
    fetch('/api/frame', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        missed = 0;
        $('wrap').classList.remove('stale');
        if (d.ref !== lastRef) { lastRef = d.ref; render(d); }
      })
      .catch(function () {
        if (++missed >= 3) $('wrap').classList.add('stale');
      });
  }

  poll();
  setInterval(poll, 2000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });
</script>
</body>
</html>
`;

/* ─── server ───────────────────────────────────────────────────────────── */

/**
 * Build the reader's HTTP server (not yet listening).
 * @param {{ span?: number, onHit?: () => void }} [opts]
 * @returns {import('http').Server}
 */
function createServer(opts = {}) {
  const span = opts.span || DEFAULT_SPAN;
  const server = http.createServer((req, res) => {
    if (opts.onHit) opts.onHit();
    const url = req.url || '/';

    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (url === '/' || url.startsWith('/?')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }
    if (url === '/api/frame' || url.startsWith('/api/frame?')) {
      let body;
      try {
        const q = url.split('?')[1] || '';
        const m = q.match(/(?:^|&)span=(\d+)/);
        const s = m ? Math.max(0, Math.min(6, parseInt(m[1], 10))) : span;
        body = JSON.stringify(frameData(s));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err && err.message) }));
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });
  return server;
}

/** Listen on the first free port at/above `start`. Resolves { server, port }. */
function listen(server, start, tries = PORT_SCAN) {
  return new Promise((resolve, reject) => {
    let port = start;
    let left = tries;
    const attempt = () => {
      server.removeAllListeners('error');
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && --left > 0) {
          port += 1;
          attempt();
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolve({ server, port });
      });
    };
    attempt();
  });
}

/**
 * Run the reader in the foreground (used by `code-with-quran serve`).
 * Resolves when the server stops (idle shutdown, SIGTERM, or SIGINT).
 *
 * @param {object} [opts]
 * @param {boolean} [opts.open]      open the browser once bound (default true)
 * @param {number}  [opts.port]      preferred port (default 7620, scans upward)
 * @param {number}  [opts.span]      ayat per side (default 3)
 * @param {number}  [opts.idleMs]    stop after this long with no request (default 3m)
 * @param {(msg:string)=>void} [opts.log]  progress line sink (default: stderr)
 * @returns {Promise<{ reused: boolean, url: string, port: number }>}
 */
async function serve(opts = {}) {
  const wantOpen = opts.open !== false;
  const log = opts.log || ((m) => process.stderr.write(m + '\n'));

  const live = registry.current();
  if (live) {
    if (wantOpen) openUrl(live.url, {});
    log(`web reader already running — ${live.url}`);
    return { reused: true, url: live.url, port: live.port };
  }

  let lastHit = Date.now();
  const server = createServer({ span: opts.span, onHit: () => (lastHit = Date.now()) });

  const { port } = await listen(server, opts.port || DEFAULT_PORT);
  server.on('error', () => server.close()); // a late socket error: shut down, don't crash
  const url = `http://127.0.0.1:${port}/`;
  const heartbeat = registry.announce(port);

  const hb = setInterval(heartbeat.beat, HEARTBEAT_MS);
  const idleMs = opts.idleMs || DEFAULT_IDLE_MS;
  const idle = setInterval(() => {
    if (Date.now() - lastHit > idleMs) server.close();
  }, Math.min(idleMs, 15_000));
  hb.unref();
  idle.unref();

  log(`web reader on ${url}`);
  if (wantOpen) openUrl(url, {});

  return new Promise((resolve) => {
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(hb);
      clearInterval(idle);
      process.removeListener('SIGTERM', stop);
      process.removeListener('SIGINT', stop);
      heartbeat.clear();
      server.close();
      resolve({ reused: false, url, port });
    };
    server.once('close', stop);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
}

/**
 * Make sure a web reader is up, without blocking. Spawns `serve` detached (which
 * binds a port and opens the browser once) when nothing is running; a live
 * server is left alone so its open tab isn't disturbed. Called at session start
 * (`start`) and as a safety net on each advance (`open`).
 * @returns {{ running: boolean, spawned: boolean, url: string|null }}
 */
function ensureServer() {
  const live = registry.current();
  if (live) return { running: true, spawned: false, url: live.url };
  const bin = path.join(__dirname, '..', 'bin', 'code-with-quran.js');
  try {
    const child = spawn(process.execPath, [bin, 'serve'], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {});
    child.unref();
    return { running: false, spawned: true, url: null };
  } catch {
    return { running: false, spawned: false, url: null };
  }
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_SPAN,
  frameData,
  createServer,
  listen,
  serve,
  ensureServer,
  PAGE,
};
