'use strict';

const fs = require('fs');
const path = require('path');
const { homeDir } = require('./paths');

/**
 * A tiny heartbeat file so `status` (and `open`) can tell whether a
 * `code-with-quran read` pane is currently running somewhere.
 */

const STALE_MS = 15_000;

function readerFile() {
  return path.join(homeDir(), 'reader.json');
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

/** Current live reader, or null. */
function current() {
  try {
    const info = JSON.parse(fs.readFileSync(readerFile(), 'utf8'));
    if (!info || typeof info.pid !== 'number') return null;
    if (!pidAlive(info.pid)) return null;
    if (Date.now() - new Date(info.updatedAt || 0).getTime() > STALE_MS) return null;
    return info;
  } catch {
    return null;
  }
}

function isRunning() {
  return current() !== null;
}

/**
 * Register this process as the running reader. Returns a handle:
 *   handle.beat()   refresh the heartbeat timestamp
 *   handle.clear()  remove the file (best effort)
 */
function announce() {
  const file = readerFile();
  const base = { pid: process.pid, startedAt: new Date().toISOString() };
  const write = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ ...base, updatedAt: new Date().toISOString() }));
    } catch {
      /* non-fatal */
    }
  };
  write();
  return {
    beat: write,
    clear() {
      try {
        const info = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (info.pid === process.pid) fs.unlinkSync(file);
      } catch {
        /* already gone */
      }
    },
  };
}

module.exports = { readerFile, current, isRunning, announce, STALE_MS };
