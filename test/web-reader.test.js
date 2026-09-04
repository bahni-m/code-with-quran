'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const web = require('../src/web-reader');
const reg = require('../src/web-registry');
const qt = require('../src/quran-text');

test.beforeEach(() => {
  process.env.CODE_WITH_QURAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cwq-web-'));
});
test.afterEach(() => {
  try {
    fs.rmSync(process.env.CODE_WITH_QURAN_HOME, { recursive: true, force: true });
  } catch {}
  delete process.env.CODE_WITH_QURAN_HOME;
});

const setPos = (surah, ayah) => require('../src/state').saveState({ surah, ayah });

function req(port, method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject);
    r.end();
  });
}
const get = (port, urlPath) => req(port, 'GET', urlPath);

async function waitFor(fn, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor: condition never met');
}

/* ─── frameData ───────────────────────────────────────────────────────── */

test('frameData centres on the pointer with neighbours on each side', () => {
  setPos(2, 255);
  const f = web.frameData(2);
  assert.equal(f.ref, '2:255');
  assert.equal(f.surah.name, 'Al-Baqarah');
  assert.equal(f.ayat.length, 5);
  const current = f.ayat.filter((a) => a.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].ref, '2:255');
  assert.deepEqual(
    f.ayat.map((a) => a.ref),
    ['2:253', '2:254', '2:255', '2:256', '2:257']
  );
  assert.equal(current[0].text, qt.ayahText(2, 255));
  assert.equal(current[0].numeral, '٢٥٥');
});

test('frameData shows the basmalah only at the head of a surah that has one', () => {
  setPos(2, 1);
  assert.equal(web.frameData(1).basmalah, qt.BASMALAH);
  setPos(2, 2);
  assert.equal(web.frameData(1).basmalah, null);
  setPos(1, 1); // Al-Fatihah: the basmalah IS ayah 1, not a header
  assert.equal(web.frameData(1).basmalah, null);
  setPos(9, 1); // At-Tawbah has no basmalah
  assert.equal(web.frameData(1).basmalah, null);
});

test('frameData wraps cleanly at the end of the Qur\'an', () => {
  setPos(114, 6);
  const f = web.frameData(3);
  assert.equal(f.progress.index, f.progress.total);
  assert.ok(f.ayat.some((a) => a.ref === '1:1'));
  assert.ok(f.ayat.every((a, i) => f.ayat.findIndex((b) => b.ref === a.ref) === i), 'no dupes');
});

/* ─── HTTP surface ────────────────────────────────────────────────────── */

test('createServer serves the page and a live frame', async () => {
  setPos(112, 1);
  const server = web.createServer({ span: 2 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.body, /code-with-quran/);
    assert.match(page.body, /\/api\/frame/);

    const api = await get(port, '/api/frame');
    assert.equal(api.status, 200);
    assert.match(api.headers['content-type'], /application\/json/);
    const data = JSON.parse(api.body);
    assert.equal(data.ref, '112:1');
    assert.equal(data.surah.name, 'Al-Ikhlas');
    assert.ok(data.ayat.find((a) => a.current).text.length > 0);

    // reflects a state change
    setPos(112, 3);
    const api2 = JSON.parse((await get(port, '/api/frame')).body);
    assert.equal(api2.ref, '112:3');

    assert.equal((await get(port, '/nope')).status, 404);
  } finally {
    server.close();
  }
});

test('move / goto write the pointer', () => {
  const { loadState } = require('../src/state');
  setPos(2, 100);
  assert.deepEqual(web.move(5), { surah: 2, ayah: 105 });
  assert.equal(loadState().ayah, 105); // persisted
  assert.deepEqual(web.move(-10), { surah: 2, ayah: 95 });
  assert.deepEqual(web.goto('Al-Kahf'), { surah: 18, ayah: 1 });
  assert.deepEqual(web.goto('2:255'), { surah: 2, ayah: 255 });
  assert.equal(loadState().surah, 2);
  assert.throws(() => web.goto('Nowhere'), /Unknown surah/);
});

test('POST /api/move and /api/goto navigate; cross-origin writes are refused', async () => {
  setPos(2, 255);
  const server = web.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    let d = JSON.parse((await req(port, 'POST', '/api/move?d=1')).body);
    assert.equal(d.ref, '2:256');
    d = JSON.parse((await req(port, 'POST', '/api/move?d=-2')).body);
    assert.equal(d.ref, '2:254');
    d = JSON.parse((await req(port, 'POST', '/api/goto?ref=' + encodeURIComponent('Al-Kahf'))).body);
    assert.equal(d.ref, '18:1');

    // same-origin header is fine
    assert.equal(
      (await req(port, 'POST', '/api/move?d=1', { origin: `http://127.0.0.1:${port}` })).status,
      200
    );
    // a stray site is not
    assert.equal(
      (await req(port, 'POST', '/api/move?d=1', { origin: 'https://evil.example' })).status,
      403
    );
    // bad reference -> 400, pointer unchanged
    const before = JSON.parse((await get(port, '/api/frame')).body).ref;
    assert.equal((await req(port, 'POST', '/api/goto?ref=Nowhere')).status, 400);
    assert.equal(JSON.parse((await get(port, '/api/frame')).body).ref, before);

    // GET is never a write path
    assert.equal((await get(port, '/api/move?d=1')).status, 404);
  } finally {
    server.close();
  }
});

test('createServer honours ?span=', async () => {
  setPos(2, 100);
  const server = web.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    const one = JSON.parse((await get(port, '/api/frame?span=1')).body);
    assert.equal(one.ayat.length, 3);
    const zero = JSON.parse((await get(port, '/api/frame?span=0')).body);
    assert.equal(zero.ayat.length, 1);
  } finally {
    server.close();
  }
});

/* ─── serve() lifecycle ───────────────────────────────────────────────── */

test('serve binds a port, registers, and a second serve reuses it', async () => {
  setPos(1, 1);
  const running = web.serve({ open: false, log: () => {}, idleMs: 400 });

  await waitFor(() => reg.isRunning());
  const info = reg.current();
  assert.ok(info.port >= web.DEFAULT_PORT);
  assert.equal(info.url, `http://127.0.0.1:${info.port}/`);

  const second = await web.serve({ open: false, log: () => {} });
  assert.equal(second.reused, true);
  assert.equal(second.url, info.url);

  const first = await running; // idle-shuts-down on its own
  assert.equal(first.reused, false);
  assert.equal(reg.isRunning(), false);
});

test('serve scans upward when the preferred port is taken', async () => {
  const blocker = http.createServer((_, res) => res.end());
  const bound = await new Promise((resolve) => {
    blocker.once('error', () => resolve(false));
    blocker.listen(web.DEFAULT_PORT, '127.0.0.1', () => resolve(true));
  });
  if (!bound) return; // port already in use by something else — skip
  try {
    const running = web.serve({ open: false, log: () => {}, idleMs: 300 });
    await waitFor(() => reg.isRunning());
    assert.ok(reg.current().port > web.DEFAULT_PORT);
    await running;
  } finally {
    blocker.close();
  }
});
