'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { isSessionActive } = require('../src/session');
const shell = require('../src/shell');

test.beforeEach(() => {
  process.env.CODE_WITH_QURAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cwq-'));
  delete process.env.CODE_WITH_QURAN;
});

test.afterEach(() => {
  try {
    fs.rmSync(process.env.CODE_WITH_QURAN_HOME, { recursive: true, force: true });
  } catch {}
  delete process.env.CODE_WITH_QURAN_HOME;
  delete process.env.CODE_WITH_QURAN;
});

test('isSessionActive reads the env var', () => {
  assert.equal(isSessionActive({}), false);
  assert.equal(isSessionActive({ CODE_WITH_QURAN: '1' }), true);
  assert.equal(isSessionActive({ CODE_WITH_QURAN: 'true' }), true);
  assert.equal(isSessionActive({ CODE_WITH_QURAN: '0' }), false);
});

test('open --session-only is a no-op without activation', () => {
  const cwq = require('../src/index');
  const res = cwq.open({ sessionOnly: true, now: new Date() });
  assert.equal(res.opened, false);
  assert.equal(res.reason, 'inactive');
  assert.equal(cwq.status().opens, 0);
});

test('open --session-only proceeds when activated', () => {
  const cwq = require('../src/index');
  process.env.CODE_WITH_QURAN = '1';
  const res = cwq.open({ sessionOnly: true, dryRun: true, now: new Date() });
  assert.equal(res.opened, true);
  assert.deepEqual(res.shownFrom, { surah: 1, ayah: 1 });
});

test('open without sessionOnly ignores the gate', () => {
  const cwq = require('../src/index');
  const res = cwq.open({ dryRun: true, now: new Date() });
  assert.equal(res.opened, true);
});

test('wrapper snippet: posix shells handle --cwq and --cwq-dgr', () => {
  for (const sh of ['bash', 'zsh']) {
    const snip = shell.wrapperSnippet(sh);
    assert.match(snip, /claude\(\) \{/);
    assert.match(snip, /--cwq\)\s+shift; CODE_WITH_QURAN=1 command claude "\$@"/);
    assert.match(snip, /--cwq-dgr\)\s+shift; CODE_WITH_QURAN=1 command claude --dangerously-skip-permissions "\$@"/);
    assert.match(snip, /command claude "\$@" ;;/); // passthrough
    assert.ok(snip.startsWith(shell.BEGIN));
    assert.ok(snip.trimEnd().endsWith(shell.END));
  }
});

test('wrapper snippet: fish variant', () => {
  const snip = shell.wrapperSnippet('fish');
  assert.match(snip, /function claude/);
  assert.match(snip, /case --cwq\n\s+set -lx CODE_WITH_QURAN 1/);
  assert.match(snip, /--dangerously-skip-permissions \$argv\[2\.\.-1\]/);
});

test('appendSnippet writes, refreshes without duplicating, and backs up', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwq-rc-'));
  const rc = path.join(dir, '.bashrc');
  fs.writeFileSync(rc, 'export PATH="$HOME/bin:$PATH"\n');

  const first = shell.appendSnippet({ shell: 'bash', file: rc });
  assert.equal(first.replaced, false);
  assert.ok(first.backupPath && fs.existsSync(first.backupPath));
  let content = fs.readFileSync(rc, 'utf8');
  assert.equal(content.match(/claude\(\) \{/g).length, 1);
  assert.match(content, /export PATH/); // pre-existing content kept

  const second = shell.appendSnippet({ shell: 'bash', file: rc });
  assert.equal(second.replaced, true);
  content = fs.readFileSync(rc, 'utf8');
  assert.equal(content.match(/claude\(\) \{/g).length, 1); // still only one

  const removed = shell.removeSnippet({ shell: 'bash', file: rc });
  assert.equal(removed.removed, true);
  content = fs.readFileSync(rc, 'utf8');
  assert.doesNotMatch(content, /code-with-quran/);
  assert.match(content, /export PATH/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('rcFileFor + detectShell', () => {
  assert.match(shell.rcFileFor('zsh', '/home/x'), /\.zshrc$/);
  assert.match(shell.rcFileFor('bash', '/home/x'), /\.bashrc$/);
  assert.match(shell.rcFileFor('fish', '/home/x'), /config\.fish$/);
  assert.equal(shell.detectShell({ SHELL: '/usr/bin/zsh' }), 'zsh');
  assert.equal(shell.detectShell({ SHELL: '/usr/local/bin/fish' }), 'fish');
  assert.equal(shell.detectShell({}), 'bash');
});
