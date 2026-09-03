'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const render = require('../src/render');
const qt = require('../src/quran-text');
const quran = require('../src/quran');

test.beforeEach(() => {
  process.env.CODE_WITH_QURAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cwq-r-'));
});
test.afterEach(() => {
  try {
    fs.rmSync(process.env.CODE_WITH_QURAN_HOME, { recursive: true, force: true });
  } catch {}
  delete process.env.CODE_WITH_QURAN_HOME;
  delete process.env.CODE_WITH_QURAN;
});

/* ─── quran-text ───────────────────────────────────────────────────────── */

// combining-mark order varies between sources; compare on the consonantal skeleton
const rasm = (s) => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[آأإٱ]/g, 'ا');

test('ayahText returns the Uthmani text and strips leading basmalah', () => {
  assert.equal(rasm(qt.ayahText(1, 1)), 'بسم الله الرحمن الرحيم'); // Al-Fatihah 1 IS the basmalah
  assert.equal(rasm(qt.ayahText(2, 1)), 'الم'); // basmalah stripped from Al-Baqarah 1
  assert.ok(rasm(qt.ayahText(9, 1)).startsWith('براءة')); // At-Tawbah has no basmalah
  assert.ok(rasm(qt.ayahText(112, 1)).startsWith('قل هو الله احد'));
});

test('ayahText clamps out-of-range references', () => {
  assert.equal(qt.ayahText(1, 999), qt.ayahText(1, 7));
  assert.equal(qt.ayahText(999, 1), qt.ayahText(114, 1));
});

test('every ayah has non-empty text', () => {
  let checked = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= quran.surah(s).ayahs; a++) {
      assert.ok(qt.ayahText(s, a).length > 0, `${s}:${a} empty`);
      checked++;
    }
  }
  assert.equal(checked, 6236);
});

test('toArabicDigits', () => {
  assert.equal(qt.toArabicDigits(255), '٢٥٥');
  assert.equal(qt.toArabicDigits(7), '٧');
});

/* ─── render ───────────────────────────────────────────────────────────── */

test('displayWidth ignores ANSI and Arabic combining marks', () => {
  assert.equal(render.displayWidth('hello'), 5);
  assert.equal(render.displayWidth('\x1b[1mhello\x1b[0m'), 5);
  const withHarakaT = 'بِسْمِ';
  assert.ok(render.displayWidth(withHarakaT) < [...withHarakaT].length);
});

test('wrap keeps lines within width', () => {
  const lines = render.wrap(qt.ayahText(2, 255), 40);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(render.displayWidth(l) <= 40, `too wide: ${l}`);
});

test('pad aligns to exact width', () => {
  assert.equal(render.displayWidth(render.pad('x', 10, 'right')), 10);
  assert.equal(render.displayWidth(render.pad('x', 10, 'center')), 10);
});

test('frame produces exactly `rows` lines, none absurdly wide', () => {
  const rows = 30;
  const lines = render.frame({ cols: 100, rows, position: { surah: 2, ayah: 255 }, following: true });
  assert.equal(lines.length, rows);
  for (const l of lines) assert.ok(render.displayWidth(l) <= 100 + 32); // + ANSI slack
  const joined = lines.join('\n');
  assert.match(joined, /Al-Baqarah/);
  assert.match(joined, /۝٢٥٥/); // current ayah marker
});

test('frame direction: logical emits raw text, visual reshapes it', () => {
  const opts = { cols: 100, rows: 24, position: { surah: 112, ayah: 1 } };
  const word = qt.ayahText(112, 1).split(' ')[0]; // first word, raw
  const logical = render.frame({ ...opts, direction: 'logical' }).join('\n');
  const visual = render.frame({ ...opts, direction: 'visual' }).join('\n');

  assert.ok(logical.includes(word), 'logical keeps the source word');
  assert.ok(!visual.includes(word), 'visual reshapes away the source form');
  assert.ok(/[ﹰ-ﻼ]/.test(visual), 'visual uses Arabic presentation forms');
  assert.ok(visual.includes('۝١'), 'ayah marker survives reshaping');
});

test('frame defaults to visual direction', () => {
  const word = qt.ayahText(112, 1).split(' ')[0];
  const dflt = render.frame({ cols: 100, rows: 24, position: { surah: 112, ayah: 1 } }).join('\n');
  assert.ok(!dflt.includes(word));
});

test('frame handles tiny terminals and surah boundaries', () => {
  assert.doesNotThrow(() => render.frame({ cols: 20, rows: 8, position: { surah: 1, ayah: 1 } }));
  assert.doesNotThrow(() => render.frame({ cols: 40, rows: 12, position: { surah: 114, ayah: 6 } }));
});

/* ─── reader registry ─────────────────────────────────────────────────── */

test('reader registry tracks a live process and clears', () => {
  const reg = require('../src/reader-registry');
  assert.equal(reg.isRunning(), false);
  const h = reg.announce();
  assert.equal(reg.isRunning(), true);
  assert.equal(reg.current().pid, process.pid);
  h.clear();
  assert.equal(reg.isRunning(), false);
});

test('reader registry ignores a dead pid', () => {
  const reg = require('../src/reader-registry');
  fs.writeFileSync(reg.readerFile(), JSON.stringify({ pid: 999999, updatedAt: new Date().toISOString() }));
  assert.equal(reg.isRunning(), false);
});

/* ─── surface config ──────────────────────────────────────────────────── */

test('open honours surface config', () => {
  const cwq = require('../src/index');
  // default: tui, no browser
  let res = cwq.open({ dryRun: true, now: new Date() });
  assert.equal(res.surface, 'tui');
  assert.equal(res.usedBrowser, false);

  cwq.setConfigKey('surface', 'browser');
  res = cwq.open({ dryRun: true, now: new Date() });
  assert.equal(res.usedBrowser, true);

  cwq.setConfigKey('surface', 'both');
  res = cwq.open({ dryRun: true, now: new Date() });
  assert.equal(res.usedBrowser, true);

  assert.throws(() => cwq.setConfigKey('surface', 'telepathy'), /one of/);
});

test('nowAyah returns arabic text for the pointer', () => {
  const cwq = require('../src/index');
  cwq.setPosition('112:1');
  const n = cwq.nowAyah();
  assert.equal(n.ref, '112:1');
  assert.ok(rasm(n.arabic).startsWith('قل هو الله احد'));
});

/* ─── tui non-TTY fallback ────────────────────────────────────────────── */

test('tui.run() prints one frame and resolves when not a TTY', async () => {
  const tui = require('../src/tui');
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  try {
    await tui.run();
  } finally {
    process.stdout.write = orig;
  }
  assert.match(chunks.join(''), /code-with-quran/);
});
