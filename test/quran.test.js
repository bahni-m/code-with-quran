'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const quran = require('../src/quran');

test('data integrity: 114 surahs, 6236 ayat', () => {
  assert.equal(quran.TOTAL_SURAHS, 114);
  assert.equal(quran.TOTAL_AYAT, 6236);
  assert.equal(quran.surah(1).ayahs, 7);
  assert.equal(quran.surah(2).ayahs, 286);
  assert.equal(quran.surah(114).ayahs, 6);
});

test('advance within a surah', () => {
  assert.deepEqual(quran.advance({ surah: 2, ayah: 1 }, 1, true), { surah: 2, ayah: 2 });
  assert.deepEqual(quran.advance({ surah: 2, ayah: 250 }, 5, true), { surah: 2, ayah: 255 });
});

test('advance crosses a surah boundary onto ayah 1', () => {
  // Al-Fatihah has 7 ayat; from 1:7 one step lands on 2:1
  assert.deepEqual(quran.advance({ surah: 1, ayah: 7 }, 1, true), { surah: 2, ayah: 1 });
  // from 1:6, two steps: 1:7 then 2:1
  assert.deepEqual(quran.advance({ surah: 1, ayah: 6 }, 2, true), { surah: 2, ayah: 1 });
});

test('advance skips whole short surahs when step is large', () => {
  // 112 (4) -> 113 (5) -> 114 (6). From 112:1, +4 => 112:2,3,4 then 113:1
  assert.deepEqual(quran.advance({ surah: 112, ayah: 1 }, 4, true), { surah: 113, ayah: 1 });
});

test('advance wraps to 1:1 at the end when loop is on', () => {
  assert.deepEqual(quran.advance({ surah: 114, ayah: 6 }, 1, true), { surah: 1, ayah: 1 });
});

test('advance pins at 114:6 at the end when loop is off', () => {
  assert.deepEqual(quran.advance({ surah: 114, ayah: 6 }, 1, false), { surah: 114, ayah: 6 });
  assert.deepEqual(quran.advance({ surah: 114, ayah: 3 }, 50, false), { surah: 114, ayah: 6 });
});

test('rewind mirrors advance', () => {
  assert.deepEqual(quran.rewind({ surah: 2, ayah: 1 }, 1, true), { surah: 1, ayah: 7 });
  assert.deepEqual(quran.rewind({ surah: 1, ayah: 1 }, 1, true), { surah: 114, ayah: 6 });
  assert.deepEqual(quran.rewind({ surah: 1, ayah: 1 }, 1, false), { surah: 1, ayah: 1 });
});

test('advance then rewind is identity across boundaries', () => {
  const start = { surah: 18, ayah: 109 }; // Al-Kahf has 110
  const fwd = quran.advance(start, 5, true);
  assert.deepEqual(quran.rewind(fwd, 5, true), start);
});

test('absoluteIndex', () => {
  assert.equal(quran.absoluteIndex({ surah: 1, ayah: 1 }), 1);
  assert.equal(quran.absoluteIndex({ surah: 2, ayah: 1 }), 8);
  assert.equal(quran.absoluteIndex({ surah: 114, ayah: 6 }), 6236);
});

test('full traversal by 1 visits every ayah exactly once', () => {
  let pos = { surah: 1, ayah: 1 };
  for (let i = 1; i < quran.TOTAL_AYAT; i++) {
    pos = quran.advance(pos, 1, false);
    assert.equal(quran.absoluteIndex(pos), i + 1);
  }
  assert.deepEqual(pos, { surah: 114, ayah: 6 });
});

test('clampPosition bounds ayah to the surah length', () => {
  assert.deepEqual(quran.clampPosition({ surah: 1, ayah: 99 }), { surah: 1, ayah: 7 });
  assert.deepEqual(quran.clampPosition({ surah: 999, ayah: 1 }), { surah: 114, ayah: 1 });
  assert.deepEqual(quran.clampPosition({ surah: 0, ayah: 0 }), { surah: 1, ayah: 1 });
});

test('parseReference accepts many shapes', () => {
  assert.deepEqual(quran.parseReference('2:255'), { surah: 2, ayah: 255 });
  assert.deepEqual(quran.parseReference('2 255'), { surah: 2, ayah: 255 });
  assert.deepEqual(quran.parseReference('2.255'), { surah: 2, ayah: 255 });
  assert.deepEqual(quran.parseReference('112'), { surah: 112, ayah: 1 });
  assert.deepEqual(quran.parseReference('Al-Baqarah:255'), { surah: 2, ayah: 255 });
  assert.deepEqual(quran.parseReference('baqarah 255'), { surah: 2, ayah: 255 });
  assert.deepEqual(quran.parseReference('Al-Ikhlas'), { surah: 112, ayah: 1 });
  assert.deepEqual(quran.parseReference('kahf 18'), { surah: 18, ayah: 18 });
});

test('parseReference rejects nonsense', () => {
  assert.throws(() => quran.parseReference(''));
  assert.throws(() => quran.parseReference('NotASurah'));
});

test('buildUrl per source', () => {
  assert.equal(quran.buildUrl({ surah: 2, ayah: 255 }, 'quran.com'), 'https://quran.com/2/255');
  assert.equal(quran.buildUrl({ surah: 2, ayah: 255 }, 'tanzil'), 'https://tanzil.net/#2:255');
  assert.equal(
    quran.buildUrl({ surah: 2, ayah: 255 }, 'quranwbw'),
    'https://quranwbw.com/2?startVerse=255'
  );
  // unknown source falls back to quran.com
  assert.equal(quran.buildUrl({ surah: 1, ayah: 1 }, 'whatever'), 'https://quran.com/1/1');
});
