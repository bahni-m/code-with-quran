'use strict';

const fs = require('fs');
const path = require('path');
const { configPath } = require('./paths');
const { SURFACE_ENV_VAR } = require('./session');

const DEFAULTS = Object.freeze({
  /** Master switch. When false, `open` does nothing. */
  enabled: true,
  /** How many ayat to move the pointer forward on each open. */
  ayatPerSession: 1,
  /**
   * Minimum minutes between two advances. `0` (default) means every prompt
   * advances one ayah. Raise it if quick bursts of prompts run you ahead of
   * what you've actually read.
   */
  cooldownMinutes: 0,
  /** Wrap from 114:6 back to 1:1 instead of stopping at the end. */
  loop: true,
  /**
   * Where each advance surfaces: tui | web | browser | both.
   *   tui      full-screen terminal reader in a second pane
   *   web      bundled local reader in your browser (RTL always renders right —
   *            the terminal can't guarantee that under tmux); offline, one tab
   *   browser  an external site (quran.com etc.) — opens a tab per advance
   *   both     tui + web
   */
  surface: 'tui',
  /**
   * Auto-open a reader pane on `claude --cwq`: off | tmux | zellij | auto.
   * Default `auto`: split a pane when you're inside tmux or zellij, do nothing
   * otherwise. Set `off` to opt out, or name a multiplexer to pin it.
   * Deduped — one reader is shared across sessions.
   */
  autopane: 'auto',
  /**
   * How the terminal reader emits Arabic: logical | visual.
   * `logical` (default) sends the raw text and lets the terminal shape and
   * reorder it — correct in terminals that run the bidi algorithm.
   * `visual` reshapes and reverses each line itself, for a bare terminal with
   * no bidi at all (plain xterm). Note: under tmux/zellij neither is reliable —
   * use `surface web` to read in the browser instead.
   */
  direction: 'logical',
  /** Reader website (when surface includes browser): quran.com | tanzil | quranwbw | alquran.cloud */
  source: 'quran.com',
  /** Explicit browser command, e.g. "firefox" or "google-chrome". Empty = OS default. */
  browser: '',
  /** Extra CLI args passed to the browser command, space-separated. */
  browserArgs: '',
});

const KEY_TYPES = {
  enabled: 'boolean',
  ayatPerSession: 'number',
  cooldownMinutes: 'number',
  loop: 'boolean',
  surface: 'string',
  autopane: 'string',
  direction: 'string',
  source: 'string',
  browser: 'string',
  browserArgs: 'string',
};

const ENUMS = {
  surface: ['tui', 'web', 'browser', 'both'],
  autopane: ['off', 'tmux', 'zellij', 'auto'],
  direction: ['logical', 'visual'],
  source: ['quran.com', 'tanzil', 'quranwbw', 'alquran.cloud'],
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...sanitise(parsed) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULTS };
    throw new Error(`Could not read config at ${configPath()}: ${err.message}`);
  }
}

function saveConfig(config) {
  const merged = { ...DEFAULTS, ...sanitise(config) };
  const dir = path.dirname(configPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

/** Keep only known keys with the right primitive type. */
function sanitise(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, type] of Object.entries(KEY_TYPES)) {
    if (obj[key] === undefined) continue;
    if (typeof obj[key] !== type) continue;
    if (ENUMS[key] && !ENUMS[key].includes(obj[key])) continue;
    out[key] = obj[key];
  }
  return out;
}

/**
 * Per-session surface override from the shell wrapper (`claude --cwq-browser`
 * exports CODE_WITH_QURAN_SURFACE=web). Returns a valid surface or null.
 * @param {NodeJS.ProcessEnv} [env]
 */
function surfaceOverride(env = process.env) {
  const v = env[SURFACE_ENV_VAR];
  return v && ENUMS.surface.includes(v) ? v : null;
}

/** The surface that should actually be used right now: session override, else config. */
function effectiveSurface(config, env = process.env) {
  return surfaceOverride(env) || (config && config.surface) || 'tui';
}

/**
 * Coerce a string value (from the CLI) into the type a config key expects.
 * @param {string} key
 * @param {string} value
 */
function coerceValue(key, value) {
  const type = KEY_TYPES[key];
  if (!type) throw new Error(`Unknown config key: "${key}". Valid keys: ${Object.keys(KEY_TYPES).join(', ')}`);
  if (type === 'boolean') {
    if (/^(true|1|yes|on)$/i.test(value)) return true;
    if (/^(false|0|no|off)$/i.test(value)) return false;
    throw new Error(`"${key}" expects true/false, got "${value}"`);
  }
  if (type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`"${key}" expects a non-negative number, got "${value}"`);
    return n;
  }
  if (ENUMS[key] && !ENUMS[key].includes(value)) {
    throw new Error(`"${key}" expects one of: ${ENUMS[key].join(', ')} — got "${value}"`);
  }
  return value;
}

module.exports = {
  DEFAULTS,
  KEY_TYPES,
  ENUMS,
  loadConfig,
  saveConfig,
  coerceValue,
  surfaceOverride,
  effectiveSurface,
};
