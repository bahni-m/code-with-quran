'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { claudeSettingsPath } = require('./paths');

/** Events that make sense as triggers (Claude Code hook event names). */
const SUPPORTED_EVENTS = ['UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart'];
const DEFAULT_EVENTS = ['UserPromptSubmit'];

/** Substring that identifies a hook entry as ours. */
const SIGNATURE = 'code-with-quran';

/**
 * Best command string to invoke the CLI from a Claude Code hook.
 * Prefers a `code-with-quran` on PATH; falls back to an absolute node invocation.
 */
function resolveCommand() {
  const binPath = path.join(__dirname, '..', 'bin', 'code-with-quran.js');
  let onPath = false;
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(probe, ['code-with-quran'], { stdio: 'ignore' });
    onPath = true;
  } catch {
    onPath = false;
  }
  const base = onPath ? 'code-with-quran' : `"${process.execPath}" "${binPath}"`;
  return `${base} open --quiet --session-only`;
}

function readSettings(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new Error(`Could not parse ${file}: ${err.message}`);
  }
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, dest);
  return dest;
}

/** Strip every code-with-quran entry from a settings object. Returns count removed. */
function stripOurHooks(settings) {
  let removed = 0;
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return 0;

  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event]
      .map((group) => {
        if (!group || !Array.isArray(group.hooks)) return group;
        const kept = group.hooks.filter((h) => {
          const isOurs = h && typeof h.command === 'string' && h.command.includes(SIGNATURE);
          if (isOurs) removed += 1;
          return !isOurs;
        });
        return { ...group, hooks: kept };
      })
      .filter((group) => !group || !Array.isArray(group.hooks) || group.hooks.length > 0);

    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return removed;
}

/**
 * Install the hook into Claude Code settings.
 * @param {{ scope?: 'global'|'project', events?: string[], dryRun?: boolean }} [opts]
 */
function install(opts = {}) {
  const scope = opts.scope === 'project' ? 'project' : 'global';
  const events = normaliseEvents(opts.events);
  const file = claudeSettingsPath(scope);
  const command = resolveCommand();

  const settings = readSettings(file);
  const backupPath = opts.dryRun ? null : backup(file);

  stripOurHooks(settings); // avoid duplicates on re-install
  if (!settings.hooks) settings.hooks = {};

  for (const event of events) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    settings.hooks[event].push({ hooks: [{ type: 'command', command }] });
  }

  if (!opts.dryRun) writeSettings(file, settings);

  return { file, scope, events, command, backupPath, dryRun: !!opts.dryRun };
}

/**
 * Remove the hook from Claude Code settings.
 * @param {{ scope?: 'global'|'project', dryRun?: boolean }} [opts]
 */
function uninstall(opts = {}) {
  const scope = opts.scope === 'project' ? 'project' : 'global';
  const file = claudeSettingsPath(scope);
  if (!fs.existsSync(file)) {
    return { file, scope, removed: 0, backupPath: null, dryRun: !!opts.dryRun };
  }
  const settings = readSettings(file);
  const backupPath = opts.dryRun ? null : backup(file);
  const removed = stripOurHooks(settings);
  if (!opts.dryRun && removed > 0) writeSettings(file, settings);
  return { file, scope, removed, backupPath, dryRun: !!opts.dryRun };
}

function normaliseEvents(events) {
  const list = (Array.isArray(events) && events.length ? events : DEFAULT_EVENTS)
    .map((e) => String(e).trim())
    .filter(Boolean);
  const unknown = list.filter((e) => !SUPPORTED_EVENTS.includes(e));
  if (unknown.length) {
    throw new Error(
      `Unsupported event(s): ${unknown.join(', ')}. Supported: ${SUPPORTED_EVENTS.join(', ')}`
    );
  }
  return [...new Set(list)];
}

module.exports = {
  SUPPORTED_EVENTS,
  DEFAULT_EVENTS,
  resolveCommand,
  install,
  uninstall,
  stripOurHooks,
  readSettings,
};
