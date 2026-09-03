'use strict';

/*
 * Zero-dependency Arabic contextual shaping + visual reordering.
 *
 * Terminals are supposed to run the Unicode Bidirectional Algorithm and shape
 * Arabic cursively. Many don't: tmux and zellij paint cells in logical order,
 * and plain xterm / Alacritty / kitty never reorder at all. Inside those the
 * Qur'an comes out left-to-right, word by word — unreadable.
 *
 * `toVisual(line)` takes one logical-order line that is predominantly Arabic and
 * returns the string a dumb left-to-right terminal must print to show it as
 * right-to-left, cursively joined Arabic. Digit runs keep their left-to-right
 * order (bidi "AN" runs). Non-Arabic lines pass through untouched.
 *
 * On a terminal that *does* implement bidi this would double-reverse, so the
 * reader exposes `direction: logical` to send the raw text instead.
 */

const R = 'R'; // joins only to a preceding letter (right side)
const D = 'D'; // joins on both sides

// base code point -> { j: joinType, f: [isolated, final, initial, medial] }
// Presentation Forms-B (U+FE70..U+FEFF), plus alef-wasla from Forms-A.
const LETTERS = {
  0x0621: { j: 'U', f: [0xfe80, 0xfe80, 0xfe80, 0xfe80] }, // hamza (non-joining)
  0x0622: { j: R, f: [0xfe81, 0xfe82, 0xfe81, 0xfe82] }, // alef madda
  0x0623: { j: R, f: [0xfe83, 0xfe84, 0xfe83, 0xfe84] }, // alef hamza above
  0x0624: { j: R, f: [0xfe85, 0xfe86, 0xfe85, 0xfe86] }, // waw hamza
  0x0625: { j: R, f: [0xfe87, 0xfe88, 0xfe87, 0xfe88] }, // alef hamza below
  0x0626: { j: D, f: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c] }, // yeh hamza
  0x0627: { j: R, f: [0xfe8d, 0xfe8e, 0xfe8d, 0xfe8e] }, // alef
  0x0628: { j: D, f: [0xfe8f, 0xfe90, 0xfe91, 0xfe92] }, // beh
  0x0629: { j: R, f: [0xfe93, 0xfe94, 0xfe93, 0xfe94] }, // teh marbuta
  0x062a: { j: D, f: [0xfe95, 0xfe96, 0xfe97, 0xfe98] }, // teh
  0x062b: { j: D, f: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c] }, // theh
  0x062c: { j: D, f: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0] }, // jeem
  0x062d: { j: D, f: [0xfea1, 0xfea2, 0xfea3, 0xfea4] }, // hah
  0x062e: { j: D, f: [0xfea5, 0xfea6, 0xfea7, 0xfea8] }, // khah
  0x062f: { j: R, f: [0xfea9, 0xfeaa, 0xfea9, 0xfeaa] }, // dal
  0x0630: { j: R, f: [0xfeab, 0xfeac, 0xfeab, 0xfeac] }, // thal
  0x0631: { j: R, f: [0xfead, 0xfeae, 0xfead, 0xfeae] }, // reh
  0x0632: { j: R, f: [0xfeaf, 0xfeb0, 0xfeaf, 0xfeb0] }, // zain
  0x0633: { j: D, f: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4] }, // seen
  0x0634: { j: D, f: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8] }, // sheen
  0x0635: { j: D, f: [0xfeb9, 0xfeba, 0xfebb, 0xfebc] }, // sad
  0x0636: { j: D, f: [0xfebd, 0xfebe, 0xfebf, 0xfec0] }, // dad
  0x0637: { j: D, f: [0xfec1, 0xfec2, 0xfec3, 0xfec4] }, // tah
  0x0638: { j: D, f: [0xfec5, 0xfec6, 0xfec7, 0xfec8] }, // zah
  0x0639: { j: D, f: [0xfec9, 0xfeca, 0xfecb, 0xfecc] }, // ain
  0x063a: { j: D, f: [0xfecd, 0xfece, 0xfecf, 0xfed0] }, // ghain
  0x0641: { j: D, f: [0xfed1, 0xfed2, 0xfed3, 0xfed4] }, // feh
  0x0642: { j: D, f: [0xfed5, 0xfed6, 0xfed7, 0xfed8] }, // qaf
  0x0643: { j: D, f: [0xfed9, 0xfeda, 0xfedb, 0xfedc] }, // kaf
  0x0644: { j: D, f: [0xfedd, 0xfede, 0xfedf, 0xfee0] }, // lam
  0x0645: { j: D, f: [0xfee1, 0xfee2, 0xfee3, 0xfee4] }, // meem
  0x0646: { j: D, f: [0xfee5, 0xfee6, 0xfee7, 0xfee8] }, // noon
  0x0647: { j: D, f: [0xfee9, 0xfeea, 0xfeeb, 0xfeec] }, // heh
  0x0648: { j: R, f: [0xfeed, 0xfeee, 0xfeed, 0xfeee] }, // waw
  0x0649: { j: R, f: [0xfeef, 0xfef0, 0xfeef, 0xfef0] }, // alef maksura
  0x064a: { j: D, f: [0xfef1, 0xfef2, 0xfef3, 0xfef4] }, // yeh
  0x0671: { j: R, f: [0xfb50, 0xfb51, 0xfb50, 0xfb51] }, // alef wasla
};

// lam + alef variant -> [isolated ligature, final ligature]
const LAM_ALEF = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc],
};

const LAM = 0x0644;
const TATWEEL = 0x0640;

/** Nonspacing mark: attaches to the preceding base, invisible to joining. */
function isMark(cp) {
  return (
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06dc) ||
    (cp >= 0x06df && cp <= 0x06e4) ||
    (cp >= 0x06e7 && cp <= 0x06e8) ||
    (cp >= 0x06ea && cp <= 0x06ed)
  );
}

/** Transparent for cursive joining: marks plus the zero-width joiner controls. */
function isTransparent(cp) {
  return isMark(cp) || cp === 0x200c || cp === 0x200d;
}

function isArabicDigit(cp) {
  return cp >= 0x0660 && cp <= 0x0669;
}

const AYAH_SIGN = 0x06dd; // ۝ END OF AYAH

/** Anything in the Arabic blocks — used to decide a line is worth reshaping. */
function hasArabic(cps) {
  return cps.some(
    (cp) =>
      (cp >= 0x0600 && cp <= 0x06ff) ||
      (cp >= 0x0750 && cp <= 0x077f) ||
      (cp >= 0xfb50 && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)
  );
}

/** A letter whose join type lets a connection reach the *next* letter. */
function reachesNext(cp) {
  return cp === TATWEEL || (LETTERS[cp] && LETTERS[cp].j === D);
}
/** A letter that can accept a connection coming from the *previous* letter. */
function acceptsPrev(cp) {
  return cp === TATWEEL || (LETTERS[cp] && (LETTERS[cp].j === D || LETTERS[cp].j === R));
}

/**
 * Replace Arabic letters with their contextual presentation forms.
 * @param {number[]} cps  logical-order code points
 * @returns {number[]}    same order, shaped, lam-alef pairs collapsed
 */
function shape(cps) {
  const n = cps.length;
  const out = cps.slice();
  const consumed = new Set();

  const prevLetter = (i) => {
    for (let k = i - 1; k >= 0; k--) {
      if (consumed.has(k)) continue;
      if (!isTransparent(cps[k])) return k;
    }
    return -1;
  };
  const nextLetter = (i) => {
    for (let k = i + 1; k < n; k++) {
      if (consumed.has(k)) continue;
      if (!isTransparent(cps[k])) return k;
    }
    return -1;
  };

  for (let i = 0; i < n; i++) {
    if (consumed.has(i)) {
      out[i] = null;
      continue;
    }
    const cp = cps[i];
    if (cp === TATWEEL) continue;
    const info = LETTERS[cp];
    if (!info) continue;

    const p = prevLetter(i);
    const joinsRight = p >= 0 && reachesNext(cps[p]);

    if (cp === LAM) {
      const q = nextLetter(i);
      if (q >= 0 && LAM_ALEF[cps[q]]) {
        out[i] = LAM_ALEF[cps[q]][joinsRight ? 1 : 0];
        consumed.add(q);
        out[q] = null;
        continue;
      }
    }

    const q = nextLetter(i);
    const joinsLeft = q >= 0 && info.j === D && acceptsPrev(cps[q]);

    let form = 0; // isolated
    if (joinsRight && joinsLeft) form = 3; // medial
    else if (joinsRight) form = 1; // final
    else if (joinsLeft) form = 2; // initial
    out[i] = info.f[form];
  }

  return out.filter((cp) => cp !== null);
}

/** Split shaped code points into grapheme clusters (base + trailing marks). */
function clusters(cps) {
  const groups = [];
  for (let i = 0; i < cps.length; i++) {
    let s = String.fromCodePoint(cps[i]);
    while (i + 1 < cps.length && isMark(cps[i + 1])) s += String.fromCodePoint(cps[++i]);
    groups.push(s);
  }
  return groups;
}

function firstCp(str) {
  return str.codePointAt(0);
}

/**
 * Logical-order Arabic line -> the string a non-bidi terminal must print for it
 * to read right-to-left. Lines with no Arabic are returned unchanged.
 * @param {string} line
 * @returns {string}
 */
function toVisual(line) {
  const cps = [...String(line)].map((c) => c.codePointAt(0));
  if (!hasArabic(cps)) return String(line);

  const groups = clusters(shape(cps));
  groups.reverse();

  // Numbers are read left-to-right even inside RTL text: undo the reversal for
  // each maximal run of Arabic-Indic digits.
  for (let i = 0; i < groups.length; ) {
    if (isArabicDigit(firstCp(groups[i]))) {
      let j = i + 1;
      while (j < groups.length && isArabicDigit(firstCp(groups[j]))) j++;
      for (let a = i, b = j - 1; a < b; a++, b--) {
        const t = groups[a];
        groups[a] = groups[b];
        groups[b] = t;
      }
      i = j;
    } else {
      i++;
    }
  }

  // Keep the ۝ ayah sign to the left of its number ("۝٢٥٥"), the way a mushaf
  // sets the ayah marker.
  for (let i = 0; i + 1 < groups.length; i++) {
    if (isArabicDigit(firstCp(groups[i])) && firstCp(groups[i + 1]) === AYAH_SIGN) {
      let s = i;
      while (s > 0 && isArabicDigit(firstCp(groups[s - 1]))) s--;
      groups.splice(i + 1, 1);
      groups.splice(s, 0, String.fromCodePoint(AYAH_SIGN));
      i++;
    }
  }

  return groups.join('');
}

module.exports = { toVisual, shape, isMark };
