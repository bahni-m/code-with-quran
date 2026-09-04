'use strict';

/**
 * Session activation gate.
 *
 * code-with-quran only opens the Qur'an when the current Claude Code session
 * was started through the shell wrapper — `claude --cwq` or `claude --cwq-dgr`
 * (see `code-with-quran shell-init`). The wrapper exports CODE_WITH_QURAN=1
 * before exec'ing the real `claude`, and Claude Code's hook subprocesses
 * inherit that environment.
 *
 * Without the wrapper (a plain `claude`), the variable is absent and the hook
 * is a silent no-op.
 */

const ENV_VAR = 'CODE_WITH_QURAN';

/**
 * Per-session surface override. `claude --cwq-browser` exports
 * CODE_WITH_QURAN_SURFACE=web so that one session reads in the browser without
 * touching `~/.code-with-quran/config.json`.
 */
const SURFACE_ENV_VAR = 'CODE_WITH_QURAN_SURFACE';

/** @returns {boolean} true when this session was activated via the wrapper. */
function isSessionActive(env = process.env) {
  const v = env[ENV_VAR];
  return v === '1' || v === 'true';
}

module.exports = { ENV_VAR, SURFACE_ENV_VAR, isSessionActive };
