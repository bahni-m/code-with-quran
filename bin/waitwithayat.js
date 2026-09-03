#!/usr/bin/env node
'use strict';

const wwy = require('../src/index');
const hook = require('../src/hook');
const { KEY_TYPES, DEFAULTS } = require('../src/config');

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

const HELP = `waitwithayat v${VERSION}
Open the Qur'an in your browser while a Claude Code session works — each open
picks up from the ayah after the last one you were shown.

USAGE
  waitwithayat [command] [options]

COMMANDS
  open                 Open the current ayah, then advance the pointer (default)
  peek                 Print the current ayah + URL without opening or advancing
  status               Show progress, streak and configuration
  set <reference>      Point at an ayah, e.g. "2:255", "Al-Kahf", "baqarah 255"
  next [n]             Move the pointer forward n ayat (default 1), no browser
  back [n]             Move the pointer backward n ayat (default 1), no browser
  reset                Return the pointer to 1:1 and clear counters
  config               Print current configuration
  config <key> <val>   Set a configuration value
  install              Add the Claude Code hook (default event: UserPromptSubmit)
  uninstall            Remove the Claude Code hook
  help                 Show this text

OPEN OPTIONS
  --force              Ignore the cooldown
  --dry-run            Show what would happen; open nothing, save nothing
  --quiet              Print nothing on success (used by the hook)
  --json               Machine-readable output

INSTALL OPTIONS
  --project            Write to ./.claude/settings.json instead of the global file
  --events=a,b         Comma-separated trigger events
                       (${hook.SUPPORTED_EVENTS.join(', ')})

CONFIG KEYS
${Object.entries(KEY_TYPES)
  .map(([k, t]) => `  ${k.padEnd(16)} ${t.padEnd(8)} (default: ${JSON.stringify(DEFAULTS[k])})`)
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
      const res = wwy.open({ force: !!flags.force, dryRun: !!flags['dry-run'] });
      if (!res.opened && res.reason === 'disabled') {
        out(flags, 'waitwithayat is disabled (config: enabled=false). Nothing opened.', res);
        return;
      }
      if (!res.opened && res.reason === 'cooldown') {
        out(
          flags,
          `Cooldown active — ${fmtDuration(res.cooldownRemainingMs)} left. Use --force to open now.`,
          res
        );
        return;
      }
      const from = wwy.quran.label(res.shownFrom);
      const next = wwy.quran.label(res.nextPosition);
      const verb = flags['dry-run'] ? 'Would open' : 'Opening';
      out(
        flags,
        `${verb} ${from}\n  ${res.url}\n  ${bar(res.progress.percent)} ${res.progress.percent}% ` +
          `(${res.progress.index}/${res.progress.total})\n  next → ${next}`,
        res
      );
      return;
    }

    case 'peek': {
      const s = wwy.status();
      out(
        flags,
        `${s.label}  ·  ${s.surah.meaning} (${s.surah.arabic})\n  ${s.url}\n  ` +
          `${bar(s.progress.percent)} ${s.progress.percent}% (${s.progress.index}/${s.progress.total})`,
        s
      );
      return;
    }

    case 'status': {
      const s = wwy.status();
      const lines = [
        `Position   ${s.label}  (${s.surah.meaning})`,
        `Progress   ${bar(s.progress.percent)} ${s.progress.percent}%  ${s.progress.index}/${s.progress.total} ayat`,
        `Opens      ${s.opens}  (total ${s.totalOpened})`,
        `Last open  ${s.lastOpenedAt || '—'}`,
        `Started    ${s.startedAt || '—'}`,
        `Source     ${s.config.source}`,
        `Enabled    ${s.config.enabled}   ayatPerSession=${s.config.ayatPerSession}   cooldown=${s.config.cooldownMinutes}m   loop=${s.config.loop}`,
      ];
      if (s.recent.length) {
        lines.push('Recent');
        for (const r of s.recent) lines.push(`  ${r.at}  ${r.shown}`);
      }
      out(flags, lines.join('\n'), s);
      return;
    }

    case 'set': {
      const ref = positional.slice(1).join(' ');
      if (!ref) throw new Error('Usage: waitwithayat set <reference>  (e.g. "2:255")');
      const res = wwy.setPosition(ref);
      out(flags, `Pointer set to ${res.label}`, res);
      return;
    }

    case 'next': {
      const n = parseInt(positional[1], 10) || 1;
      const res = wwy.moveNext(n);
      out(flags, `Pointer → ${res.label}`, res);
      return;
    }

    case 'back': {
      const n = parseInt(positional[1], 10) || 1;
      const res = wwy.moveBack(n);
      out(flags, `Pointer → ${res.label}`, res);
      return;
    }

    case 'reset': {
      const res = wwy.reset();
      out(flags, 'Pointer reset to Al-Fatihah 1:1. Counters cleared.', res);
      return;
    }

    case 'config': {
      if (positional.length >= 3) {
        const res = wwy.setConfigKey(positional[1], positional.slice(2).join(' '));
        out(flags, `${res.key} = ${JSON.stringify(res.value)}`, res);
        return;
      }
      if (positional.length === 2) {
        const cfg = wwy.getConfig();
        out(flags, `${positional[1]} = ${JSON.stringify(cfg[positional[1]])}`, {
          [positional[1]]: cfg[positional[1]],
        });
        return;
      }
      const cfg = wwy.getConfig();
      out(
        flags,
        Object.entries(cfg)
          .map(([k, v]) => `  ${k.padEnd(16)} ${JSON.stringify(v)}`)
          .join('\n'),
        cfg
      );
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
        `${res.dryRun ? 'Would install' : 'Installed'} waitwithayat hook`,
        `  file    ${res.file}`,
        `  events  ${res.events.join(', ')}`,
        `  command ${res.command}`,
        res.backupPath ? `  backup  ${res.backupPath}` : null,
      ]
        .filter(Boolean)
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
          (res.backupPath ? `\n  backup  ${res.backupPath}` : '')
        : `No waitwithayat hook found in ${res.file}`;
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
  process.stderr.write(`waitwithayat: ${err.message}\n`);
  process.exitCode = 1;
}
