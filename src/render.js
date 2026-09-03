'use strict';

const quran = require('./quran');
const qt = require('./quran-text');
const arabic = require('./arabic');

/* ─── ANSI ─────────────────────────────────────────────────────────────── */

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  fg: (n) => `\x1b[38;5;${n}m`,
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

// Arabic combining marks + bidi / zero-width joiners: no printable column.
//   U+0610-061A, U+064B-065F, U+0670, U+06D6-06DC, U+06DF-06E4, U+06E7-06E8,
//   U+06EA-06ED, U+200B-200F, U+FEFF
const ZERO_WIDTH_RE =
  /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ​-‏﻿]/g;

function stripAnsi(str) {
  return String(str).replace(ANSI_RE, '');
}

/** Best-effort printable column width (Arabic combining marks count as 0). */
function displayWidth(str) {
  return [...stripAnsi(str).replace(ZERO_WIDTH_RE, '')].length;
}

/* ─── text layout ──────────────────────────────────────────────────────── */

/** Greedy word-wrap to `width` columns. Returns an array of lines. */
function wrap(text, width) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (displayWidth(candidate) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Pad a line to `width` columns. align: 'left' | 'right' | 'center'. */
function pad(line, width, align) {
  const slack = Math.max(0, width - displayWidth(line));
  if (align === 'right') return ' '.repeat(slack) + line;
  if (align === 'center') {
    const left = Math.floor(slack / 2);
    return ' '.repeat(left) + line + ' '.repeat(slack - left);
  }
  return line + ' '.repeat(slack);
}

function progressBar(percent, width) {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/* ─── the frame ────────────────────────────────────────────────────────── */

/**
 * Build the reader frame as an array of at most `rows` strings.
 * Pure: no I/O, no terminal calls.
 *
 * @param {object} o
 * @param {number} o.cols
 * @param {number} o.rows
 * @param {{surah:number,ayah:number}} o.position
 * @param {boolean} [o.following]  follow-mode indicator
 * @param {boolean} [o.paused]     activation is off / disabled
 * @param {'visual'|'logical'} [o.direction]  'visual' (default) reshapes and
 *        reorders Arabic for terminals with no bidi; 'logical' emits raw text.
 * @returns {string[]}
 */
function frame(o) {
  const cols = Math.max(24, o.cols || 80);
  const rows = Math.max(10, o.rows || 24);
  const shape = o.direction === 'logical' ? (s) => s : arabic.toVisual;
  const pos = quran.clampPosition(o.position);
  const s = quran.surah(pos.surah);
  const contentW = Math.min(cols - 4, 72);
  const margin = Math.floor((cols - contentW) / 2);
  const indent = (l) => ' '.repeat(margin) + l;
  const idx = quran.absoluteIndex(pos);
  const percent = Math.round((idx / quran.TOTAL_AYAT) * 1000) / 10;

  /* header (3 lines) */
  const flag = o.paused
    ? ANSI.fg(179) + 'paused' + ANSI.reset
    : o.following
      ? ANSI.fg(108) + '● following' + ANSI.reset
      : ANSI.fg(245) + '○ manual' + ANSI.reset;
  const title = ANSI.dim + 'code-with-quran' + ANSI.reset;
  const gap = Math.max(1, cols - displayWidth(title) - displayWidth(flag));
  const header = [
    title + ' '.repeat(gap) + flag,
    '',
    ANSI.dim +
      pad(
        `${s.name} · ${shape(s.arabic)} · ${s.meaning} · ${s.revelationPlace}`,
        cols,
        'center'
      ) +
      ANSI.reset,
  ];

  /* footer (2 lines) */
  const meter = `${progressBar(percent, 20)}  ${percent}%   ${idx} / ${quran.TOTAL_AYAT}`;
  const footer = [
    ANSI.dim + pad(meter, cols, 'center') + ANSI.reset,
    ANSI.dim +
      pad('j/k move · g goto · f follow · r reload · q quit', cols, 'center') +
      ANSI.reset,
  ];

  /* body: current ayah bright, neighbours dim, packed to fill the middle */
  const bodyRows = Math.max(1, rows - header.length - footer.length - 2);
  const blocks = buildBlocks(pos, contentW, bodyRows, shape);

  const bodyLines = [];
  for (const b of blocks) {
    for (const l of b.lines) {
      bodyLines.push(indent((b.current ? ANSI.bold : ANSI.dim) + l + ANSI.reset));
    }
    bodyLines.push('');
  }
  if (bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

  const padTop = Math.max(0, Math.floor((bodyRows - bodyLines.length) / 2));
  const body = [...Array(padTop).fill(''), ...bodyLines].slice(0, bodyRows);
  while (body.length < bodyRows) body.push('');

  return [...header, '', ...body, '', ...footer].slice(0, rows);
}

/**
 * The current ayah plus as many neighbours as fit in `maxRows`, current one
 * roughly centred in the stack.
 */
function buildBlocks(pos, width, maxRows, shape = (s) => s) {
  const make = (p) => {
    const withMarker = `${qt.ayahText(p.surah, p.ayah)} ۝${qt.toArabicDigits(p.ayah)}`;
    const lines = wrap(withMarker, width).map((l) => pad(shape(l), width, 'right'));
    return { lines, current: p.surah === pos.surah && p.ayah === pos.ayah };
  };

  const current = make(pos);
  const blocks = [current];
  let used = current.lines.length + 1;
  let before = pos;
  let after = pos;

  for (let step = 0; used < maxRows && step < 60; step++) {
    let added = false;
    if (step % 2 === 0) {
      const p = quran.rewind(before, 1, false);
      if ((p.surah !== before.surah || p.ayah !== before.ayah)) {
        const b = make(p);
        if (used + b.lines.length + 1 <= maxRows) {
          blocks.unshift(b);
          used += b.lines.length + 1;
          before = p;
          added = true;
        }
      }
    } else {
      const p = quran.advance(after, 1, false);
      if ((p.surah !== after.surah || p.ayah !== after.ayah)) {
        const b = make(p);
        if (used + b.lines.length + 1 <= maxRows) {
          blocks.push(b);
          used += b.lines.length + 1;
          after = p;
          added = true;
        }
      }
    }
    if (!added && step > 3) break;
  }
  return blocks;
}

module.exports = { ANSI, stripAnsi, displayWidth, wrap, pad, progressBar, frame };
