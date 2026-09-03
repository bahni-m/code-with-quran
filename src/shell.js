'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ENV_VAR } = require('./session');

const BEGIN = '# >>> code-with-quran >>>';
const END = '# <<< code-with-quran <<<';

const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'];

/**
 * The shell wrapper that activates code-with-quran for a session.
 *
 * `claude --cwq`      -> exports CODE_WITH_QURAN=1, runs the real claude
 * `claude --cwq-dgr`  -> same, plus --dangerously-skip-permissions
 * anything else        -> the real claude, untouched
 *
 * @param {'bash'|'zsh'|'fish'} shell
 * @returns {string} snippet including BEGIN/END markers, newline-terminated
 */
function wrapperSnippet(shell) {
  const kind = normaliseShell(shell);
  const body = kind === 'fish' ? fishBody() : posixBody();
  return `${BEGIN}\n# Managed by \`code-with-quran shell-init\`. Edit above/below, not inside.\n${body}\n${END}\n`;
}

function posixBody() {
  return [
    'claude() {',
    '  case "${1:-}" in',
    `    --cwq)     shift; ${ENV_VAR}=1 command claude "$@" ;;`,
    `    --cwq-dgr) shift; ${ENV_VAR}=1 command claude --dangerously-skip-permissions "$@" ;;`,
    '    *)         command claude "$@" ;;',
    '  esac',
    '}',
  ].join('\n');
}

function fishBody() {
  return [
    'function claude',
    '    switch "$argv[1]"',
    '        case --cwq',
    `            set -lx ${ENV_VAR} 1`,
    '            command claude $argv[2..-1]',
    '        case --cwq-dgr',
    `            set -lx ${ENV_VAR} 1`,
    '            command claude --dangerously-skip-permissions $argv[2..-1]',
    "        case '*'",
    '            command claude $argv',
    '    end',
    'end',
  ].join('\n');
}

function normaliseShell(shell) {
  const s = String(shell || '').toLowerCase();
  if (s.includes('fish')) return 'fish';
  if (s.includes('zsh')) return 'zsh';
  if (s.includes('bash')) return 'bash';
  if (SUPPORTED_SHELLS.includes(s)) return s;
  throw new Error(`Unsupported shell: "${shell}". Use one of: ${SUPPORTED_SHELLS.join(', ')}`);
}

/** Detect the user's shell from $SHELL (default: bash). */
function detectShell(env = process.env) {
  const sh = path.basename(env.SHELL || '');
  if (sh.includes('fish')) return 'fish';
  if (sh.includes('zsh')) return 'zsh';
  return 'bash';
}

/** The rc file a snippet should live in for a given shell. */
function rcFileFor(shell, home = os.homedir()) {
  switch (normaliseShell(shell)) {
    case 'zsh':
      return path.join(home, '.zshrc');
    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish');
    case 'bash':
    default:
      return path.join(home, '.bashrc');
  }
}

function stripBlock(content) {
  const lines = content.split('\n');
  const out = [];
  let inside = false;
  let removed = false;
  for (const line of lines) {
    if (line.trim() === BEGIN) {
      inside = true;
      removed = true;
      continue;
    }
    if (line.trim() === END) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  // collapse a trailing run of blank lines we may have introduced
  while (out.length > 1 && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop();
  return { content: out.join('\n'), removed };
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, dest);
  return dest;
}

/**
 * Append (or refresh) the wrapper block in an rc file.
 * @param {{ shell?: string, file?: string, dryRun?: boolean }} [opts]
 */
function appendSnippet(opts = {}) {
  const shell = normaliseShell(opts.shell || detectShell());
  const file = opts.file || rcFileFor(shell);
  const snippet = wrapperSnippet(shell);

  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const { content: withoutOld, removed: replaced } = stripBlock(existing);
  const base = withoutOld.replace(/\s*$/, '');
  const next = (base ? base + '\n\n' : '') + snippet;

  const backupPath = opts.dryRun ? null : backup(file);
  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next);
  }
  return { shell, file, backupPath, replaced, dryRun: !!opts.dryRun, snippet };
}

/**
 * Remove the wrapper block from an rc file.
 * @param {{ shell?: string, file?: string, dryRun?: boolean }} [opts]
 */
function removeSnippet(opts = {}) {
  const shell = normaliseShell(opts.shell || detectShell());
  const file = opts.file || rcFileFor(shell);
  let existing;
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { shell, file, removed: false, backupPath: null, dryRun: !!opts.dryRun };
    throw err;
  }
  const { content, removed } = stripBlock(existing);
  const backupPath = opts.dryRun || !removed ? null : backup(file);
  if (!opts.dryRun && removed) fs.writeFileSync(file, content.replace(/\s*$/, '') + '\n');
  return { shell, file, removed, backupPath, dryRun: !!opts.dryRun };
}

module.exports = {
  BEGIN,
  END,
  SUPPORTED_SHELLS,
  wrapperSnippet,
  detectShell,
  rcFileFor,
  stripBlock,
  appendSnippet,
  removeSnippet,
};
