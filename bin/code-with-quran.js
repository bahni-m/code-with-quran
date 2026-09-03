#!/usr/bin/env node
'use strict';

const cwq = require('../src/index');
const hook = require('../src/hook');
const shell = require('../src/shell');
const tui = require('../src/tui');
const pane = require('../src/pane');
const { KEY_TYPES, DEFAULTS, ENUMS } = require('../src/config');
const { isSessionActive } = require('../src/session');

const VERSION = require('../package.json').version;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function fmtDuration(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function bar(percent, width = 24) {
  const filled = Math.round((percent / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(Math.max(0, width - filled))}]`;
}

const HELP = `code-with-quran v${VERSION}
Read the Qur'an while a Claude Code session works — each prompt advances you one
ayah from where you last left off.

Keep a reader open in a second pane:
  code-with-quran read
Start Claude sessions with the wrapper so the hook advances that reader:
  claude --cwq        activate for this session
  claude --cwq-dgr    activate + --dangerously-skip-permissions
  (install the wrapper: code-with-quran shell-init --append)

USAGE
  code-with-quran [command] [options]     (alias: cwq)

COMMANDS
  read                 Full-screen reader pane; follows the pointer as you work
  open-pane            Split off a reader pane (needs tmux or zellij)
  now                  Print the current ayah (Arabic + ref) — for statuslines
  open                 Advance the pointer (+ open browser if surface=browser)
  peek                 Print the current ayah + URL without advancing
  status               Progress, reader state, activation and configuration
  set <reference>      Point at an ayah, e.g. "2:255", "Al-Kahf", "baqarah 255"
  next [n]             Move the pointer forward n ayat (default 1)
  back [n]             Move the pointer backward n ayat (default 1)
  reset                Return the pointer to 1:1 and clear counters
  config               Print current configuration
  config <key> <val>   Set a configuration value
  shell-init           Print / install the shell wrapper (claude --cwq)
  install              Add the Claude Code hook (default event: UserPromptSubmit)
  uninstall            Remove the Claude Code hook
  help                 Show this text

READER KEYS
  j / k                Next / previous ayah        f   toggle follow-mode
  g                    Go to a reference           r   reload from disk
  q                    Quit

OPEN OPTIONS
  --session-only       No-op unless started via 'claude --cwq' (used by the hook)
  --force              Ignore the cooldown
  --dry-run            Show what would happen; change nothing
  --quiet              Print nothing on success (used by the hook)
  --json               Machine-readable output

SHELL-INIT OPTIONS
  --shell=bash|zsh|fish   Target shell (default: detected from $SHELL)
  --append                Write the wrapper into your rc file (with backup)
  --remove                Remove a previously written wrapper

INSTALL OPTIONS
  --project            Write to ./.claude/settings.json instead of the global file
  --events=a,b         Comma-separated trigger events
                       (${hook.SUPPORTED_EVENTS.join(', ')})

CONFIG KEYS
${Object.entries(KEY_TYPES)
  .map(([k, t]) => {
    const hint = ENUMS[k] ? ENUMS[k].join('|') : t;
    return `  ${k.padEnd(16)} ${hint.padEnd(26)} (default: ${JSON.stringify(DEFAULTS[k])})`;
  })
  .join('\n')}
`;

function out(flags, human, data) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else if (!flags.quiet && human) {
    process.stdout.write(human + '\n');
  }
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0] || 'open';

  if (flags.version || flags.v || command === 'version') {
    process.stdout.write(VERSION + '\n');
    return;
  }
  if (flags.help || flags.h || command === 'help') {
    process.stdout.write(HELP);
    return;
  }

  switch (command) {
    case 'open': {
      const res = cwq.open({
        force: !!flags.force,
        dryRun: !!flags['dry-run'],
        sessionOnly: !!flags['session-only'],
      });
      if (!res.opened && res.reason === 'inactive') {
        out(
          flags,
          `Session not activated — start Claude Code with 'claude --cwq' to enable code-with-quran.`,
          res
        );
        return;
      }
      if (!res.opened && res.reason === 'disabled') {
        out(flags, 'code-with-quran is disabled (config: enabled=false). Nothing advanced.', res);
        return;
      }
      if (!res.opened && res.reason === 'cooldown') {
        out(
          flags,
          `Cooldown active — ${fmtDuration(res.cooldownRemainingMs)} left. Use --force to advance now.`,
          res
        );
        return;
      }
      const from = cwq.quran.label(res.shownFrom);
      const next = cwq.quran.label(res.nextPosition);
      const verb = flags['dry-run'] ? 'Would show' : 'Now showing';
      let note;
      if (res.usedBrowser) note = `  ${res.url}`;
      else if (res.readerRunning) note = '  (updated your reader pane)';
      else note = "  (run 'code-with-quran read' in another pane to see it)";
      out(
        flags,
        `${verb} ${from}\n${note}\n  ${bar(res.progress.percent)} ${res.progress.percent}% ` +
          `(${res.progress.index}/${res.progress.total})\n  next → ${next}`,
        res
      );
      return;
    }

    case 'read': {
      tui.run().then(() => process.exit(0));
      return;
    }

    case 'open-pane': {
      const res = pane.openPane({ auto: !!flags.auto, dryRun: !!flags['dry-run'] });
      if (res.spawned) {
        out(flags, `Opened a reader pane (${res.target}).`, res);
      } else if (flags.auto) {
        // Wrapper mode: stay quiet for the expected non-events (disabled, no
        // multiplexer, reader already up), but say something when the split
        // was actually meant to happen and didn't.
        if (res.code === 'spawn-failed' || res.code === 'wrong-multiplexer') {
          process.stderr.write(
            `code-with-quran: reader pane not opened — ${res.reason}. ` +
              `Open one yourself with 'code-with-quran read'.\n`
          );
        }
        out(flags, null, res);
      } else {
        out(flags, `No reader pane: ${res.reason}.`, res);
      }
      return;
    }

    case 'now': {
      const n = cwq.nowAyah();
      if (flags.json) {
        out(flags, null, n);
      } else {
        process.stdout.write(`${n.arabic}\n${n.label}\n`);
      }
      return;
    }

    case 'peek': {
      const s = cwq.status();
      out(
        flags,
        `${s.label}  ·  ${s.surah.meaning} (${s.surah.arabic})\n  ${s.url}\n  ` +
          `${bar(s.progress.percent)} ${s.progress.percent}% (${s.progress.index}/${s.progress.total})`,
        s
      );
      return;
    }

    case 'status': {
      const s = cwq.status();
      const active = isSessionActive();
      const reader = s.reader
        ? `running (pid ${s.reader.pid})`
        : 'not running — start one with: code-with-quran read';
      const mux = pane.detectMultiplexer();
      const autopane = s.config.autopane;
      let autopaneNote;
      if (autopane === 'off') {
        autopaneNote = "  (off — open a pane yourself with 'code-with-quran read')";
      } else if (!mux) {
        autopaneNote = '  (no tmux/zellij here — nothing to split)';
      } else if (autopane !== 'auto' && autopane !== mux) {
        autopaneNote = `  (set to ${autopane} but you're in ${mux})`;
      } else {
        autopaneNote = `  (${mux} — pane opens on 'claude --cwq')`;
      }
      const lines = [
        `Activation ${active ? 'ON  (this session was started with --cwq)' : 'OFF (plain claude — hook is a no-op)'}`,
        `Reader     ${reader}`,
        `Position   ${s.label}  (${s.surah.meaning})`,
        `Progress   ${bar(s.progress.percent)} ${s.progress.percent}%  ${s.progress.index}/${s.progress.total} ayat`,
        `Advances   ${s.opens}  (total ${s.totalOpened})`,
        `Last       ${s.lastOpenedAt || '—'}`,
        `Started    ${s.startedAt || '—'}`,
        `Surface    ${s.config.surface}${s.config.surface !== 'tui' ? `  (source ${s.config.source})` : ''}`,
        `Autopane   ${autopane}${autopaneNote}`,
        `Enabled    ${s.config.enabled}   ayatPerSession=${s.config.ayatPerSession}   cooldown=${s.config.cooldownMinutes}m   loop=${s.config.loop}`,
      ];
      if (s.recent.length) {
        lines.push('Recent');
        for (const r of s.recent) lines.push(`  ${r.at}  ${r.shown}`);
      }
      out(flags, lines.join('\n'), { ...s, activation: active });
      return;
    }

    case 'set': {
      const ref = positional.slice(1).join(' ');
      if (!ref) throw new Error('Usage: code-with-quran set <reference>  (e.g. "2:255")');
      const res = cwq.setPosition(ref);
      out(flags, `Pointer set to ${res.label}`, res);
      return;
    }

    case 'next': {
      const n = parseInt(positional[1], 10) || 1;
      const res = cwq.moveNext(n);
      out(flags, `Pointer → ${res.label}`, res);
      return;
    }

    case 'back': {
      const n = parseInt(positional[1], 10) || 1;
      const res = cwq.moveBack(n);
      out(flags, `Pointer → ${res.label}`, res);
      return;
    }

    case 'reset': {
      const res = cwq.reset();
      out(flags, 'Pointer reset to Al-Fatihah 1:1. Counters cleared.', res);
      return;
    }

    case 'config': {
      if (positional.length >= 3) {
        const res = cwq.setConfigKey(positional[1], positional.slice(2).join(' '));
        out(flags, `${res.key} = ${JSON.stringify(res.value)}`, res);
        return;
      }
      if (positional.length === 2) {
        const cfg = cwq.getConfig();
        out(flags, `${positional[1]} = ${JSON.stringify(cfg[positional[1]])}`, {
          [positional[1]]: cfg[positional[1]],
        });
        return;
      }
      const cfg = cwq.getConfig();
      out(
        flags,
        Object.entries(cfg)
          .map(([k, v]) => `  ${k.padEnd(16)} ${JSON.stringify(v)}`)
          .join('\n'),
        cfg
      );
      return;
    }

    case 'shell-init': {
      const targetShell = flags.shell ? String(flags.shell) : shell.detectShell();
      if (flags.remove) {
        const res = shell.removeSnippet({ shell: targetShell, dryRun: !!flags['dry-run'] });
        out(
          flags,
          res.removed
            ? `${res.dryRun ? 'Would remove' : 'Removed'} wrapper from ${res.file}` +
                (res.backupPath ? `\n  backup  ${res.backupPath}` : '')
            : `No code-with-quran wrapper found in ${res.file}`,
          res
        );
        return;
      }
      if (flags.append) {
        const res = shell.appendSnippet({ shell: targetShell, dryRun: !!flags['dry-run'] });
        out(
          flags,
          [
            `${res.dryRun ? 'Would write' : (res.replaced ? 'Refreshed' : 'Added')} wrapper for ${res.shell}`,
            `  file    ${res.file}`,
            res.backupPath ? `  backup  ${res.backupPath}` : null,
            '',
            `Reload your shell:  source ${res.file}`,
            `Then run:  claude --cwq   (or  claude --cwq-dgr)`,
            '',
            `In tmux/zellij? 'claude --cwq' opens the reader pane for you`,
            `(disable with 'code-with-quran config autopane off').`,
          ]
            .filter((l) => l !== null)
            .join('\n'),
          res
        );
        return;
      }
      // print only
      const snippet = shell.wrapperSnippet(targetShell);
      if (flags.json) {
        out(flags, null, { shell: targetShell, file: shell.rcFileFor(targetShell), snippet });
      } else {
        process.stdout.write(
          `# Add this to your ${targetShell} rc file ` +
            `(or run: code-with-quran shell-init --append):\n\n${snippet}`
        );
      }
      return;
    }

    case 'install': {
      const events = flags.events ? String(flags.events).split(',') : undefined;
      const res = hook.install({
        scope: flags.project ? 'project' : 'global',
        events,
        dryRun: !!flags['dry-run'],
      });
      const msg = [
        `${res.dryRun ? 'Would install' : 'Installed'} code-with-quran hook`,
        `  file    ${res.file}`,
        `  events  ${res.events.join(', ')}`,
        `  command ${res.command}`,
        res.backupPath ? `  backup  ${res.backupPath}` : null,
        '',
        `Next:`,
        `  code-with-quran shell-init --append   # install the 'claude --cwq' wrapper`,
        `  code-with-quran read                  # open a reader pane (tmux split / 2nd terminal)`,
        `Then start sessions with 'claude --cwq' or 'claude --cwq-dgr'.`,
      ]
        .filter((l) => l !== null)
        .join('\n');
      out(flags, msg, res);
      return;
    }

    case 'uninstall': {
      const res = hook.uninstall({
        scope: flags.project ? 'project' : 'global',
        dryRun: !!flags['dry-run'],
      });
      const msg = res.removed
        ? `${res.dryRun ? 'Would remove' : 'Removed'} ${res.removed} hook entr${res.removed === 1 ? 'y' : 'ies'} from ${res.file}` +
          (res.backupPath ? `\n  backup  ${res.backupPath}` : '') +
          `\n(the shell wrapper, if any, stays — remove it with: code-with-quran shell-init --remove)`
        : `No code-with-quran hook found in ${res.file}`;
      out(flags, msg, res);
      return;
    }

    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      process.stdout.write(HELP);
      process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`code-with-quran: ${err.message}\n`);
  process.exitCode = 1;
}
