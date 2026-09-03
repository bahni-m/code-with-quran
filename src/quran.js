'use strict';

const fs = require('fs');
const path = require('path');

/** @typedef {{ surah: number, ayah: number }} Position */

const SURAHS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'surahs.json'), 'utf8')
);

const TOTAL_SURAHS = SURAHS.length; // 114
const TOTAL_AYAT = SURAHS.reduce((sum, s) => sum + s.ayahs, 0); // 6236

/**
 * @param {number} n 1-based surah number
 * @returns {{ number: number, name: string, meaning: string, arabic: string, ayahs: number, revelationPlace: string }}
 */
function surah(n) {
  const s = SURAHS[n - 1];
  if (!s) throw new Error(`Surah ${n} does not exist (valid: 1-${TOTAL_SURAHS})`);
  return s;
}

/**
 * Validate and normalise a position. Throws on an out-of-range surah/ayah.
 * @param {Position} pos
 * @returns {Position}
 */
function clampPosition(pos) {
  let sNum = Math.trunc(pos.surah);
  if (sNum < 1) sNum = 1;
  if (sNum > TOTAL_SURAHS) sNum = TOTAL_SURAHS;
  let aNum = Math.trunc(pos.ayah);
  if (aNum < 1) aNum = 1;
  const max = surah(sNum).ayahs;
  if (aNum > max) aNum = max;
  return { surah: sNum, ayah: aNum };
}

/**
 * Advance a position by `step` ayat, crossing surah boundaries.
 * When the end of the Qur'an is reached: wrap to 1:1 if `loop`, otherwise
 * stay pinned at the final ayah (114:6).
 * @param {Position} pos
 * @param {number} step number of ayat to move forward (>= 1)
 * @param {boolean} loop
 * @returns {Position}
 */
function advance(pos, step, loop) {
  let { surah: s, ayah: a } = clampPosition(pos);
  let remaining = Math.max(1, Math.trunc(step));

  while (remaining > 0) {
    const inThisSurah = surah(s).ayahs - a;
    if (remaining <= inThisSurah) {
      a += remaining;
      remaining = 0;
    } else {
      remaining -= inThisSurah + 1; // step onto ayah 1 of the next surah
      s += 1;
      a = 1;
      if (s > TOTAL_SURAHS) {
        if (loop) {
          s = 1;
        } else {
          return { surah: TOTAL_SURAHS, ayah: surah(TOTAL_SURAHS).ayahs };
        }
      }
    }
  }
  return { surah: s, ayah: a };
}

/**
 * Move a position backward by `step` ayat.
 * @param {Position} pos
 * @param {number} step
 * @param {boolean} loop
 * @returns {Position}
 */
function rewind(pos, step, loop) {
  let { surah: s, ayah: a } = clampPosition(pos);
  let remaining = Math.max(1, Math.trunc(step));

  while (remaining > 0) {
    if (remaining < a) {
      a -= remaining;
      remaining = 0;
    } else {
      remaining -= a;
      s -= 1;
      if (s < 1) {
        if (loop) {
          s = TOTAL_SURAHS;
        } else {
          return { surah: 1, ayah: 1 };
        }
      }
      a = surah(s).ayahs;
    }
  }
  return { surah: s, ayah: a };
}

/**
 * 1-based absolute index of a position within the whole Qur'an (1..6236).
 * @param {Position} pos
 * @returns {number}
 */
function absoluteIndex(pos) {
  const { surah: s, ayah: a } = clampPosition(pos);
  let idx = 0;
  for (let i = 1; i < s; i++) idx += surah(i).ayahs;
  return idx + a;
}

/**
 * Parse a human reference into a Position.
 * Accepts: "2:255", "2 255", "2.255", "Al-Baqarah:255", "baqarah 255",
 * "112" (whole surah -> ayah 1), "Al-Ikhlas".
 * @param {string} input
 * @returns {Position}
 */
function parseReference(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Empty reference');

  const m = raw.match(/^(.+?)[\s:.\-/]+(\d+)$/);
  let namePart;
  let ayahPart;
  if (m) {
    namePart = m[1].trim();
    ayahPart = parseInt(m[2], 10);
  } else {
    namePart = raw;
    ayahPart = 1;
  }

  let surahNum;
  if (/^\d+$/.test(namePart)) {
    surahNum = parseInt(namePart, 10);
  } else {
    surahNum = findSurahByName(namePart);
    if (!surahNum) throw new Error(`Unknown surah: "${namePart}"`);
  }

  return clampPosition({ surah: surahNum, ayah: ayahPart });
}

/**
 * Fuzzy-match a surah by transliterated or Arabic name. Returns the number or null.
 * @param {string} query
 * @returns {number | null}
 */
function findSurahByName(query) {
  const norm = (str) =>
    String(str)
      .toLowerCase()
      .replace(/[''`]/g, '')
      .replace(/[^a-z0-9؀-ۿ]+/g, '');
  const q = norm(query);
  if (!q) return null;

  let exact = null;
  let prefix = null;
  let contains = null;
  for (const s of SURAHS) {
    const name = norm(s.name);
    const arabic = norm(s.arabic);
    if (name === q || arabic === q) exact = s.number;
    else if (!prefix && (name.startsWith(q) || q.startsWith(name))) prefix = s.number;
    else if (!contains && (name.includes(q) || q.includes(name))) contains = s.number;
  }
  return exact || prefix || contains || null;
}

/**
 * Human label for a position, e.g. "Al-Baqarah 2:255 (Ayat al-Kursi range)".
 * @param {Position} pos
 * @returns {string}
 */
function label(pos) {
  const { surah: s, ayah: a } = clampPosition(pos);
  return `${surah(s).name} ${s}:${a}`;
}

/**
 * Build the browser URL for a position and source.
 * @param {Position} pos
 * @param {string} source one of: quran.com, tanzil, quranwbw, alquran.cloud
 * @returns {string}
 */
function buildUrl(pos, source) {
  const { surah: s, ayah: a } = clampPosition(pos);
  switch ((source || 'quran.com').toLowerCase()) {
    case 'tanzil':
    case 'tanzil.net':
      return `https://tanzil.net/#${s}:${a}`;
    case 'quranwbw':
    case 'quranwbw.com':
      return `https://quranwbw.com/${s}?startVerse=${a}`;
    case 'alquran.cloud':
    case 'alquran':
      return `https://alquran.cloud/surah/${s}/${a}`;
    case 'quran.com':
    default:
      return `https://quran.com/${s}/${a}`;
  }
}

module.exports = {
  SURAHS,
  TOTAL_SURAHS,
  TOTAL_AYAT,
  surah,
  clampPosition,
  advance,
  rewind,
  absoluteIndex,
  parseReference,
  findSurahByName,
  label,
  buildUrl,
};
