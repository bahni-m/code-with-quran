'use strict';

const fs = require('fs');
const path = require('path');
const { homeDir } = require('./paths');

/**
 * Heartbeat file for the bundled web reader (`code-with-quran serve`).
 *
 * Mirrors reader-registry.js, but tracks the local server's port/URL too so a
 * second `claude --cwq` can reuse the running server instead of binding a new
 * one. One reader, shared across sessions.
 */

const STALE_MS = 15_000;

function serverFile() {
  return path.join(homeDir(), 'web-reader.json');
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

/** The live web reader, or null. */
function current() {
  try {
    const info = JSON.parse(fs.readFileSync(serverFile(), 'utf8'));
    if (!info || typeof info.pid !== 'number' || typeof info.port !== 'number') return null;
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
 * Register this process as the running web reader on `port`.
 * Returns { beat(), clear() } — see reader-registry.js.
 * @param {number} port
 */
function announce(port) {
  const file = serverFile();
  const base = {
    pid: process.pid,
    port,
    url: `http://127.0.0.1:${port}/`,
    startedAt: new Date().toISOString(),
  };
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

module.exports = { serverFile, current, isRunning, announce, STALE_MS };
