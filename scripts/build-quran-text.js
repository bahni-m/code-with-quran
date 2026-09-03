#!/usr/bin/env node
'use strict';

/*
 * Builds data/quran-uthmani.json from the alquran.cloud "quran-uthmani" edition,
 * which serves the Tanzil Project Uthmani text.
 *
 * Output shape: { "<surahNumber>": ["<ayah 1>", "<ayah 2>", ...], ... }
 *
 * Usage:
 *   curl -sS https://api.alquran.cloud/v1/quran/quran-uthmani -o /tmp/uthmani.json
 *   node scripts/build-quran-text.js /tmp/uthmani.json
 */

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node scripts/build-quran-text.js <alquran.cloud-response.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const surahs = raw && raw.data && raw.data.surahs;
if (!Array.isArray(surahs) || surahs.length !== 114) {
  console.error('Unexpected source shape: expected data.surahs with 114 entries');
  process.exit(1);
}

const clean = (s) =>
  String(s)
    .replace(/﻿/g, '') // stray BOM / zero-width no-break space
    .trim();

// The alquran.cloud "quran-uthmani" edition prepends the opening basmalah to
// ayah 1 of every surah except At-Tawbah (9). In the mushaf that basmalah is an
// unnumbered opening, not part of ayah 1 — except in Al-Fatihah (1), where it
// *is* ayah 1. So strip the prefix from ayah 1 of surahs 2..114 (excluding 9).
// Compare on the consonantal skeleton (rasm): drop diacritics/tatweel and
// fold alef variants. Combining-mark order and stray marks differ between
// sources (e.g. surahs 95 and 97 carry an extra shadda on the ba). The stored
// text itself is left exactly as distributed; only ayah 1's leading basmalah —
// four tokens — is removed for surahs that carry it.
const skeleton = (s) =>
  String(s)
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ﻿]/g, '')
    .replace(/[آأإٱ]/g, 'ا');
const BASMALAH_RASM = skeleton('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');

const out = {};
let total = 0;
let stripped = 0;
for (const s of surahs) {
  const ayat = s.ayahs.map((a) => clean(a.text));
  const firstFour = ayat[0].split(' ').slice(0, 4).join(' ');
  if (s.number !== 1 && s.number !== 9 && skeleton(firstFour) === BASMALAH_RASM) {
    ayat[0] = ayat[0].split(' ').slice(4).join(' ').trim();
    stripped += 1;
  }
  out[s.number] = ayat;
  total += ayat.length;
}
if (stripped !== 112) {
  console.error(`Expected to strip the basmalah from 112 surahs, stripped ${stripped}`);
  process.exit(1);
}

if (total !== 6236) {
  console.error(`Ayah total mismatch: got ${total}, expected 6236`);
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'data', 'quran-uthmani.json');
fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Wrote ${total} ayat (${kb} KB) to ${outPath}`);
