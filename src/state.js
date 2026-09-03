'use strict';

const fs = require('fs');
const path = require('path');
const { statePath } = require('./paths');
const { clampPosition } = require('./quran');

const HISTORY_LIMIT = 50;

const INITIAL_STATE = () => ({
  surah: 1,
  ayah: 1,
  totalOpened: 0,
  opens: 0,
  lastOpenedAt: null,
  startedAt: null,
  history: [],
});

function loadState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const pos = clampPosition({ surah: parsed.surah, ayah: parsed.ayah });
    return {
      ...INITIAL_STATE(),
      ...parsed,
      surah: pos.surah,
      ayah: pos.ayah,
      history: Array.isArray(parsed.history) ? parsed.history.slice(-HISTORY_LIMIT) : [],
    };
  } catch (err) {
    if (err.code === 'ENOENT') return INITIAL_STATE();
    throw new Error(`Could not read state at ${statePath()}: ${err.message}`);
  }
}

function saveState(state) {
  const pos = clampPosition({ surah: state.surah, ayah: state.ayah });
  const out = {
    ...state,
    surah: pos.surah,
    ayah: pos.ayah,
    history: Array.isArray(state.history) ? state.history.slice(-HISTORY_LIMIT) : [],
  };
  const dir = path.dirname(statePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(out, null, 2) + '\n');
  return out;
}

function resetState() {
  return saveState(INITIAL_STATE());
}

/** @returns {{ surah: number, ayah: number }} */
function position(state) {
  return { surah: state.surah, ayah: state.ayah };
}

module.exports = { INITIAL_STATE, HISTORY_LIMIT, loadState, saveState, resetState, position };
