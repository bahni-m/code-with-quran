'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pane = require('../src/pane');

test.beforeEach(() => {
  process.env.CODE_WITH_QURAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cwq-p-'));
  delete process.env.TMUX;
  delete process.env.ZELLIJ;
  delete process.env.ZELLIJ_SESSION_NAME;
});
test.afterEach(() => {
  try {
    fs.rmSync(process.env.CODE_WITH_QURAN_HOME, { recursive: true, force: true });
  } catch {}
  delete process.env.CODE_WITH_QURAN_HOME;
  delete process.env.TMUX;
  delete process.env.ZELLIJ;
});

test('detectMultiplexer reads the environment', () => {
  assert.equal(pane.detectMultiplexer({}), null);
  assert.equal(pane.detectMultiplexer({ TMUX: '/tmp/tmux-1000/default,123,0' }), 'tmux');
  assert.equal(pane.detectMultiplexer({ ZELLIJ: '0' }), 'zellij');
  assert.equal(pane.detectMultiplexer({ ZELLIJ_SESSION_NAME: 'main' }), 'zellij');
});

test('openPane --auto splits a pane in tmux by default (autopane=auto)', () => {
  process.env.TMUX = 'x';
  const res = pane.openPane({ auto: true, dryRun: true });
  assert.equal(res.reason, 'dry-run');
  assert.equal(res.target, 'tmux');
});

test('openPane --auto is a silent no-op when autopane=off', () => {
  const cwq = require('../src/index');
  cwq.setConfigKey('autopane', 'off');
  process.env.TMUX = 'x';
  const res = pane.openPane({ auto: true, dryRun: true });
  assert.equal(res.spawned, false);
  assert.equal(res.reason, 'disabled');
  assert.equal(res.code, 'disabled');
});

test('openPane --auto outside any multiplexer is a quiet no-op', () => {
  const res = pane.openPane({ auto: true, dryRun: true }); // autopane=auto, no TMUX/ZELLIJ
  assert.equal(res.spawned, false);
  assert.equal(res.code, 'no-multiplexer');
});

test('openPane --auto requires being inside the configured multiplexer', () => {
  const cwq = require('../src/index');
  cwq.setConfigKey('autopane', 'tmux');

  let res = pane.openPane({ auto: true, dryRun: true }); // not in tmux
  assert.equal(res.spawned, false);
  assert.match(res.reason, /not inside tmux/);

  process.env.TMUX = 'x';
  res = pane.openPane({ auto: true, dryRun: true });
  assert.equal(res.reason, 'dry-run');
  assert.equal(res.target, 'tmux');
  assert.deepEqual(res.argv.slice(0, 3), ['tmux', 'split-window', '-d']);
  assert.equal(res.argv[res.argv.length - 1], 'code-with-quran read');
});

test('openPane (manual) needs a multiplexer', () => {
  const res = pane.openPane({ dryRun: true });
  assert.equal(res.spawned, false);
  assert.match(res.reason, /no multiplexer/);
});

test('openPane builds a zellij invocation', () => {
  process.env.ZELLIJ = '0';
  const res = pane.openPane({ dryRun: true });
  assert.equal(res.target, 'zellij');
  assert.equal(res.argv[0], 'zellij');
  assert.ok(res.argv.includes('--'));
  assert.ok(res.argv.slice(-2).join(' ') === 'code-with-quran read');
});

test('openPane skips when a reader is already running', () => {
  const registry = require('../src/reader-registry');
  process.env.TMUX = 'x';
  const h = registry.announce();
  try {
    const res = pane.openPane({ dryRun: true });
    assert.equal(res.spawned, false);
    assert.match(res.reason, /already running/);
  } finally {
    h.clear();
  }
});
