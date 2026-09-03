'use strict';

const fs = require('fs');
const readline = require('readline');
const { statePath } = require('./paths');
const { loadState, saveState } = require('./state');
const { loadConfig } = require('./config');
const quran = require('./quran');
const render = require('./render');
const registry = require('./reader-registry');

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[2J\x1b[H';

/**
 * Run the full-screen reader. Resolves when the user quits.
 * In a non-TTY (piped) context it prints one frame and returns.
 */
function run() {
  const out = process.stdout;

  if (!out.isTTY || !process.stdin.isTTY) {
    const st = loadState();
    out.write(
      render
        .frame({
          cols: out.columns || 80,
          rows: out.rows || 24,
          position: { surah: st.surah, ayah: st.ayah },
          following: true,
        })
        .join('\n') + '\n'
    );
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let following = true;
    let pos = posFromDisk();
    let lastSelfWrite = 0;
    let watcher = null;

    const heartbeat = registry.announce();
    const hbTimer = setInterval(heartbeat.beat, 5000);
    hbTimer.unref && hbTimer.unref();

    function posFromDisk() {
      const s = loadState();
      return quran.clampPosition({ surah: s.surah, ayah: s.ayah });
    }

    function persist() {
      lastSelfWrite = Date.now();
      const s = loadState();
      saveState({ ...s, surah: pos.surah, ayah: pos.ayah });
    }

    function paint() {
      const cfg = loadConfig();
      const lines = render.frame({
        cols: out.columns || 80,
        rows: out.rows || 24,
        position: pos,
        following,
        paused: cfg.enabled === false,
      });
      out.write(CLEAR + lines.join('\r\n'));
    }

    function move(delta) {
      pos =
        delta > 0 ? quran.advance(pos, delta, true) : quran.rewind(pos, -delta, true);
      persist();
      paint();
    }

    function armWatch() {
      try {
        // make sure the file exists so fs.watch has something to watch
        saveState(loadState());
        watcher = fs.watch(statePath(), { persistent: false }, () => {
          if (Date.now() - lastSelfWrite < 400) return;
          const disk = posFromDisk();
          if (disk.surah === pos.surah && disk.ayah === pos.ayah) return;
          if (following) {
            pos = disk;
            paint();
          }
        });
      } catch {
        watcher = null;
      }
    }

    function cleanup() {
      clearInterval(hbTimer);
      if (watcher) watcher.close();
      try {
        process.stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
      process.stdin.pause();
      process.stdin.removeListener('keypress', onKey);
      process.removeListener('SIGWINCH', paint);
      process.removeListener('SIGTERM', cleanup);
      heartbeat.clear();
      out.write(CURSOR_SHOW + ALT_OFF);
      resolve();
    }

    function onKey(str, key) {
      if (!key) return;
      if (key.ctrl && key.name === 'c') return cleanup();
      switch (key.name) {
        case 'q':
        case 'escape':
          return cleanup();
        case 'j':
        case 'n':
        case 'right':
        case 'down':
        case 'space':
          return move(+1);
        case 'k':
        case 'p':
        case 'left':
        case 'up':
          return move(-1);
        case 'f':
          following = !following;
          return paint();
        case 'r':
          pos = posFromDisk();
          return paint();
        case 'g':
          return promptGoto();
        default:
          return undefined;
      }
    }

    function promptGoto() {
      process.stdin.removeListener('keypress', onKey);
      try {
        process.stdin.setRawMode(false);
      } catch {
        /* ignore */
      }
      const row = out.rows || 24;
      out.write(
        `${CURSOR_SHOW}\x1b[${row};1H\x1b[2K` +
          render.ANSI.dim +
          'goto (e.g. 2:255, Al-Kahf) › ' +
          render.ANSI.reset
      );
      const rl = readline.createInterface({ input: process.stdin, output: out });
      rl.question('', (answer) => {
        rl.close();
        try {
          if (answer.trim()) {
            pos = quran.parseReference(answer.trim());
            persist();
          }
        } catch {
          /* ignore a bad reference */
        }
        try {
          process.stdin.setRawMode(true);
        } catch {
          /* ignore */
        }
        process.stdin.resume();
        process.stdin.on('keypress', onKey);
        out.write(CURSOR_HIDE);
        paint();
      });
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    process.on('SIGWINCH', paint);
    process.on('SIGTERM', cleanup);

    armWatch();
    out.write(ALT_ON + CURSOR_HIDE);
    paint();
  });
}

module.exports = { run };
