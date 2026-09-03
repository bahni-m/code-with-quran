'use strict';

const quran = require('./quran');
const { loadConfig, saveConfig, coerceValue, DEFAULTS, KEY_TYPES } = require('./config');
const { loadState, saveState, resetState, position } = require('./state');
const { openUrl } = require('./open');

/**
 * The heart of the tool: open the current ayah, then advance the pointer.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force]   ignore the cooldown
 * @param {boolean} [opts.dryRun]  compute everything, open nothing, persist nothing
 * @param {Date}    [opts.now]     injectable clock (tests)
 * @returns {{
 *   opened: boolean,
 *   reason?: 'disabled' | 'cooldown',
 *   shownFrom: {surah:number,ayah:number},
 *   nextPosition: {surah:number,ayah:number},
 *   url: string,
 *   cooldownRemainingMs?: number,
 *   progress: { index: number, total: number, percent: number },
 * }}
 */
function open(opts = {}) {
  const { force = false, dryRun = false, now = new Date() } = opts;
  const config = loadConfig();
  const state = loadState();
  const shownFrom = position(state);
  const url = quran.buildUrl(shownFrom, config.source);
  const idx = quran.absoluteIndex(shownFrom);
  const progress = {
    index: idx,
    total: quran.TOTAL_AYAT,
    percent: Math.round((idx / quran.TOTAL_AYAT) * 1000) / 10,
  };

  if (!config.enabled) {
    return { opened: false, reason: 'disabled', shownFrom, nextPosition: shownFrom, url, progress };
  }

  if (!force && state.lastOpenedAt) {
    const elapsed = now.getTime() - new Date(state.lastOpenedAt).getTime();
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    if (elapsed >= 0 && elapsed < cooldownMs) {
      return {
        opened: false,
        reason: 'cooldown',
        shownFrom,
        nextPosition: shownFrom,
        url,
        cooldownRemainingMs: cooldownMs - elapsed,
        progress,
      };
    }
  }

  const next = quran.advance(shownFrom, config.ayatPerSession, config.loop);

  if (!dryRun) {
    openUrl(url, { browser: config.browser, browserArgs: config.browserArgs });
    const entry = {
      at: now.toISOString(),
      shown: `${shownFrom.surah}:${shownFrom.ayah}`,
      url,
    };
    saveState({
      ...state,
      surah: next.surah,
      ayah: next.ayah,
      totalOpened: state.totalOpened + 1,
      opens: state.opens + 1,
      lastOpenedAt: now.toISOString(),
      startedAt: state.startedAt || now.toISOString(),
      history: [...state.history, entry],
    });
  }

  return { opened: true, shownFrom, nextPosition: next, url, progress };
}

/** Read-only snapshot for `status` / `peek`. */
function status() {
  const config = loadConfig();
  const state = loadState();
  const pos = position(state);
  const idx = quran.absoluteIndex(pos);
  return {
    position: pos,
    label: quran.label(pos),
    surah: quran.surah(pos.surah),
    url: quran.buildUrl(pos, config.source),
    progress: {
      index: idx,
      total: quran.TOTAL_AYAT,
      percent: Math.round((idx / quran.TOTAL_AYAT) * 1000) / 10,
    },
    totalOpened: state.totalOpened,
    opens: state.opens,
    lastOpenedAt: state.lastOpenedAt,
    startedAt: state.startedAt,
    recent: state.history.slice(-5).reverse(),
    config,
  };
}

/** Point at an explicit reference like "2:255" or "Al-Kahf". */
function setPosition(reference) {
  const pos = quran.parseReference(reference);
  const state = loadState();
  saveState({ ...state, surah: pos.surah, ayah: pos.ayah });
  return { position: pos, label: quran.label(pos) };
}

/** Move the pointer forward without opening a browser. */
function moveNext(step = 1) {
  const config = loadConfig();
  const state = loadState();
  const pos = quran.advance(position(state), step, config.loop);
  saveState({ ...state, surah: pos.surah, ayah: pos.ayah });
  return { position: pos, label: quran.label(pos) };
}

/** Move the pointer backward without opening a browser. */
function moveBack(step = 1) {
  const config = loadConfig();
  const state = loadState();
  const pos = quran.rewind(position(state), step, config.loop);
  saveState({ ...state, surah: pos.surah, ayah: pos.ayah });
  return { position: pos, label: quran.label(pos) };
}

function reset() {
  return resetState();
}

function getConfig() {
  return loadConfig();
}

function setConfigKey(key, rawValue) {
  const value = coerceValue(key, rawValue);
  const current = loadConfig();
  const saved = saveConfig({ ...current, [key]: value });
  return { key, value, config: saved };
}

module.exports = {
  open,
  status,
  setPosition,
  moveNext,
  moveBack,
  reset,
  getConfig,
  setConfigKey,
  quran,
  DEFAULTS,
  KEY_TYPES,
};
