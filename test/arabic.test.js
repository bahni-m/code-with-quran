'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { toVisual, shape } = require('../src/arabic');
const qt = require('../src/quran-text');

const cp = (s, i = 0) => [...s][i].codePointAt(0);
const MARK = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/;

test('lines with no Arabic pass through untouched', () => {
  assert.equal(toVisual('hello world'), 'hello world');
  assert.equal(toVisual('j/k move · q quit'), 'j/k move · q quit');
  assert.equal(toVisual(''), '');
});

test('contextual shaping picks initial/medial/final forms', () => {
  // بت : beh initial (U+FE91), teh final (U+FE96)
  const shaped = shape([...'بت'].map((c) => c.codePointAt(0)));
  assert.deepEqual(shaped, [0xfe91, 0xfe96]);
});

test('a right-joining letter breaks the cursive run after it', () => {
  // بدب : beh initial, dal final (not medial — dal never joins left),
  //       trailing beh isolated because dal does not reach it
  const shaped = shape([...'بدب'].map((c) => c.codePointAt(0)));
  assert.deepEqual(shaped, [0xfe91, 0xfeaa, 0xfe8f]);
});

test('lam + alef collapses to the ligature', () => {
  const shaped = shape([...'لا'].map((c) => c.codePointAt(0)));
  assert.equal(shaped.length, 1);
  assert.ok(shaped[0] === 0xfefb || shaped[0] === 0xfefc);
});

test('visual order reverses the word run', () => {
  // logical ا then ب  ->  visual ب then ا
  const v = toVisual('اب');
  assert.equal(cp(v, 0), 0xfe8f); // beh isolated comes first on screen
  assert.equal(cp(v, 1), 0xfe8d); // alef isolated second
});

test('digit runs keep their left-to-right order', () => {
  const v = toVisual('نور ۝١٢٣');
  assert.ok(v.includes('۝١٢٣'), `ayah marker intact: ${v}`);
  assert.ok(!v.includes('۝٣٢١'));
});

test('reshaping preserves every combining mark and never leads with one', () => {
  const src = qt.ayahText(2, 255);
  const v = toVisual(src);
  assert.ok(!MARK.test([...v][0]), 'first glyph is a base, not a mark');
  const count = (s) => [...s].filter((c) => MARK.test(c)).length;
  assert.equal(count(v), count(src), 'no marks dropped');
});

test('reversing twice restores the original cluster order', () => {
  // shape() is idempotent on presentation forms, so a second pass only undoes
  // the reordering — the marks and glyphs line back up with the source order.
  const src = 'نور وضياء';
  assert.equal(toVisual(toVisual(src)), shapeInPlace(src));
});

// helper: shape without reordering, for the round-trip check above
function shapeInPlace(s) {
  return shape([...s].map((c) => c.codePointAt(0)))
    .map((c) => String.fromCodePoint(c))
    .join('');
}

test('every ayah reshapes without throwing and stays non-empty', () => {
  const quran = require('../src/quran');
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= quran.surah(s).ayahs; a++) {
      const v = toVisual(qt.ayahText(s, a));
      assert.ok(v.length > 0, `${s}:${a} empty after reshape`);
    }
  }
});
