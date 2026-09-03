'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpHome() {
  // paths.js reads CODE_WITH_QURAN_HOME on every call, so a fresh dir is a fresh world
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wwy-'));
  process.env.CODE_WITH_QURAN_HOME = dir;
  return dir;
}

test.beforeEach(() => {
  tmpHome();
});

test.afterEach(() => {
  try {
    fs.rmSync(process.env.CODE_WITH_QURAN_HOME, { recursive: true, force: true });
  } catch {}
  delete process.env.CODE_WITH_QURAN_HOME;
});

test('open advances the pointer and is idempotent under cooldown', () => {
  const wwy = require('../src/index');
  const t0 = new Date('2026-01-01T00:00:00Z');

  const first = wwy.open({ now: t0 });
  assert.equal(first.opened, true);
  assert.deepEqual(first.shownFrom, { surah: 1, ayah: 1 });
  assert.deepEqual(first.nextPosition, { surah: 1, ayah: 2 });

  // one minute later: cooldown (default 3m) blocks
  const blocked = wwy.open({ now: new Date(t0.getTime() + 60_000) });
  assert.equal(blocked.opened, false);
  assert.equal(blocked.reason, 'cooldown');
  assert.ok(blocked.cooldownRemainingMs > 0);

  // --force overrides
  const forced = wwy.open({ now: new Date(t0.getTime() + 60_000), force: true });
  assert.equal(forced.opened, true);
  assert.deepEqual(forced.shownFrom, { surah: 1, ayah: 2 });
  assert.deepEqual(forced.nextPosition, { surah: 1, ayah: 3 });

  // after the cooldown window: opens normally
  const later = wwy.open({ now: new Date(t0.getTime() + 10 * 60_000) });
  assert.equal(later.opened, true);
  assert.deepEqual(later.shownFrom, { surah: 1, ayah: 3 });

  const s = wwy.status();
  assert.equal(s.opens, 3);
  assert.equal(s.totalOpened, 3);
  assert.deepEqual(s.position, { surah: 1, ayah: 4 });
  assert.equal(s.recent.length, 3);
});

test('dry-run opens nothing and persists nothing', () => {
  const wwy = require('../src/index');
  const res = wwy.open({ dryRun: true, now: new Date() });
  assert.equal(res.opened, true);
  assert.deepEqual(res.shownFrom, { surah: 1, ayah: 1 });
  assert.equal(wwy.status().opens, 0);
  assert.equal(wwy.status().lastOpenedAt, null);
});

test('disabled config short-circuits open', () => {
  const wwy = require('../src/index');
  wwy.setConfigKey('enabled', 'false');
  const res = wwy.open({ now: new Date() });
  assert.equal(res.opened, false);
  assert.equal(res.reason, 'disabled');
  assert.equal(wwy.status().opens, 0);
});

test('config coercion and persistence', () => {
  const wwy = require('../src/index');
  wwy.setConfigKey('ayatPerSession', '5');
  wwy.setConfigKey('source', 'tanzil');
  wwy.setConfigKey('loop', 'no');
  const cfg = wwy.getConfig();
  assert.equal(cfg.ayatPerSession, 5);
  assert.equal(cfg.source, 'tanzil');
  assert.equal(cfg.loop, false);

  assert.throws(() => wwy.setConfigKey('ayatPerSession', 'lots'));
  assert.throws(() => wwy.setConfigKey('bogusKey', '1'));

  const res = wwy.open({ dryRun: true, now: new Date() });
  assert.equal(res.url, 'https://tanzil.net/#1:1');
  assert.deepEqual(res.nextPosition, { surah: 1, ayah: 6 });
});

test('set / next / back / reset move the pointer without opening', () => {
  const wwy = require('../src/index');
  wwy.setPosition('Al-Baqarah:255');
  assert.deepEqual(wwy.status().position, { surah: 2, ayah: 255 });

  wwy.moveNext(2);
  assert.deepEqual(wwy.status().position, { surah: 2, ayah: 257 });
  wwy.moveBack(10);
  assert.deepEqual(wwy.status().position, { surah: 2, ayah: 247 });

  wwy.reset();
  assert.deepEqual(wwy.status().position, { surah: 1, ayah: 1 });
  assert.equal(wwy.status().opens, 0);
});

test('state survives a corrupt/out-of-range file', () => {
  const wwy = require('../src/index');
  const { statePath } = require('../src/paths');
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify({ surah: 200, ayah: 9999 }));
  assert.deepEqual(wwy.status().position, { surah: 114, ayah: 6 });
});

test('hook install / uninstall round-trip on a project settings file', () => {
  const hook = require('../src/hook');
  const cwd = process.cwd();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'wwy-proj-'));
  process.chdir(proj);
  try {
    fs.mkdirSync(path.join(proj, '.claude'));
    fs.writeFileSync(
      path.join(proj, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo keep-me' }] }] } }, null, 2)
    );

    const inst = hook.install({ scope: 'project', events: ['UserPromptSubmit', 'Notification'] });
    assert.equal(inst.events.length, 2);
    assert.ok(inst.backupPath && fs.existsSync(inst.backupPath));

    const after = hook.readSettings(inst.file);
    assert.ok(after.hooks.UserPromptSubmit[0].hooks[0].command.includes('code-with-quran'));
    assert.ok(after.hooks.Notification[0].hooks[0].command.includes('code-with-quran'));
    // pre-existing unrelated hook is untouched
    assert.equal(after.hooks.Stop[0].hooks[0].command, 'echo keep-me');

    // re-install does not duplicate
    hook.install({ scope: 'project', events: ['UserPromptSubmit'] });
    const reAfter = hook.readSettings(inst.file);
    assert.equal(reAfter.hooks.UserPromptSubmit.length, 1);

    const un = hook.uninstall({ scope: 'project' });
    assert.ok(un.removed >= 1);
    const cleaned = hook.readSettings(inst.file);
    assert.equal(cleaned.hooks.Stop[0].hooks[0].command, 'echo keep-me');
    assert.equal(cleaned.hooks.UserPromptSubmit, undefined);
    assert.equal(cleaned.hooks.Notification, undefined);
  } finally {
    process.chdir(cwd);
    fs.rmSync(proj, { recursive: true, force: true });
  }
});

test('unsupported hook event is rejected', () => {
  const hook = require('../src/hook');
  assert.throws(() => hook.install({ scope: 'project', events: ['NotAnEvent'] }), /Unsupported/);
});
