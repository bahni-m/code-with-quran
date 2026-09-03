'use strict';

const { spawn } = require('child_process');

/**
 * Open a URL in the browser without blocking the caller.
 *
 * Resolution order:
 *   1. explicit `browser` command from config (+ optional `browserArgs`)
 *   2. per-platform default opener (xdg-open / open / cmd start)
 *
 * @param {string} url
 * @param {{ browser?: string, browserArgs?: string, dryRun?: boolean }} [opts]
 * @returns {{ command: string, args: string[], skipped: boolean }}
 */
function openUrl(url, opts = {}) {
  const { browser = '', browserArgs = '', dryRun = false } = opts;

  let command;
  let args;
  let shell = false;

  if (browser && browser.trim()) {
    command = browser.trim();
    args = [...splitArgs(browserArgs), url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '""', url.replace(/&/g, '^&')];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  if (dryRun) return { command, args, skipped: true };

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell,
    });
    child.on('error', () => {
      /* swallowed: a missing opener must never crash the hook */
    });
    child.unref();
  } catch {
    /* swallowed */
  }

  return { command, args, skipped: false };
}

function splitArgs(str) {
  return String(str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

module.exports = { openUrl };
