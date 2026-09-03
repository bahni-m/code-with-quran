'use strict';

const { spawnSync } = require('child_process');
const registry = require('./reader-registry');
const { loadConfig } = require('./config');

/**
 * Open the reader in a new multiplexer pane, next to the current one.
 *
 * Only possible inside tmux or zellij — a plain terminal has no pane to make.
 * Deduped against the reader heartbeat, so calling it from every `claude --cwq`
 * is safe: at most one reader pane exists, shared across sessions.
 */

/** Which multiplexer are we in? 'tmux' | 'zellij' | null */
function detectMultiplexer(env = process.env) {
  if (env.TMUX) return 'tmux';
  if (env.ZELLIJ || env.ZELLIJ_SESSION_NAME) return 'zellij';
  return null;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.auto]   respect the `autopane` config setting (wrapper mode)
 * @param {boolean} [opts.dryRun] resolve the command but don't spawn
 * @param {string}  [opts.readerCmd] command the pane should run (default: "code-with-quran read")
 * @returns {{ spawned: boolean, reason?: string, target?: string, argv?: string[] }}
 */
function openPane(opts = {}) {
  const readerCmd = opts.readerCmd || 'code-with-quran read';

  let target;
  if (opts.auto) {
    const mode = loadConfig().autopane || 'off';
    if (mode === 'off') return { spawned: false, reason: 'disabled' };
    target = mode === 'auto' ? detectMultiplexer() : mode;
    // asked for a specific multiplexer but we're not in it
    if (mode !== 'auto' && detectMultiplexer() !== mode) {
      return { spawned: false, reason: `not inside ${mode}` };
    }
  } else {
    target = detectMultiplexer();
  }

  if (!target) return { spawned: false, reason: 'no multiplexer (need tmux or zellij)' };
  if (registry.isRunning()) return { spawned: false, reason: 'reader already running' };

  const argv =
    target === 'tmux'
      ? ['tmux', 'split-window', '-d', '-h', '-l', '42%', readerCmd]
      : ['zellij', 'run', '--direction', 'right', '--close-on-exit', '--', ...readerCmd.split(' ')];

  if (opts.dryRun) return { spawned: false, reason: 'dry-run', target, argv };

  const res = spawnSync(argv[0], argv.slice(1), { stdio: 'ignore' });
  if (res.error || res.status !== 0) {
    return { spawned: false, reason: `${target} split failed`, target, argv };
  }
  return { spawned: true, target, argv };
}

module.exports = { detectMultiplexer, openPane };
