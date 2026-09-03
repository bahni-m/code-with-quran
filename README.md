# waitwithayat

> Turn the wait into worship. While a Claude Code session grinds through a task,
> `waitwithayat` opens the Qur'an in your browser — and every time it opens, it
> picks up from the ayah **after** the last one it showed you.

No dashboards, no streak-shaming. Just: Claude starts working → a tab opens at
your next ayah → you read a few lines instead of watching a spinner.

---

## How it works

`waitwithayat` keeps a single pointer (`surah:ayah`) in `~/.waitwithayat/state.json`.

1. You submit a prompt in Claude Code.
2. The `UserPromptSubmit` hook runs `waitwithayat open --quiet`.
3. It opens your browser at the current pointer (e.g. `quran.com/2/255`)…
4. …then advances the pointer by `ayatPerSession` ayat (default: 1), crossing
   surah boundaries and wrapping `114 → 1` when you finish.
5. A cooldown (default: 3 minutes) means rapid back-to-back prompts won't bury
   you in tabs.

It can't know exactly which ayah you stopped reading, so it assumes you read
what it showed you. Drifted? `waitwithayat set 2:255` puts the pointer wherever
you want.

## Install

Requires Node.js ≥ 18. Zero runtime dependencies.

```bash
git clone https://github.com/bahni-m/waitwithayat.git
cd waitwithayat
npm link          # puts `waitwithayat` (and `wwy`) on your PATH
```

or run it straight from a clone with `node bin/waitwithayat.js …`.

## Wire it into Claude Code

```bash
waitwithayat install
```

This adds a hook to `~/.claude/settings.json` (your existing settings are backed
up to `settings.json.bak-<timestamp>` first). Default trigger is
`UserPromptSubmit`. To pick different events or a project-local install:

```bash
waitwithayat install --events=UserPromptSubmit,Notification
waitwithayat install --project        # writes ./.claude/settings.json
waitwithayat uninstall                # clean removal, restores nothing else
```

Supported events: `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`,
`SessionStart`.

## Commands

| Command | What it does |
| --- | --- |
| `waitwithayat` / `… open` | Open the current ayah, then advance the pointer |
| `… open --force` | Ignore the cooldown |
| `… open --dry-run` | Show what would happen; open nothing, save nothing |
| `… peek` | Print the current ayah + URL, no open, no advance |
| `… status` | Progress bar, open count, streak, config |
| `… set <ref>` | Point at an ayah — `2:255`, `Al-Kahf`, `baqarah 255` |
| `… next [n]` / `… back [n]` | Nudge the pointer without opening a browser |
| `… reset` | Back to Al-Fatihah 1:1, counters cleared |
| `… config` | Print config |
| `… config <key> <value>` | Set a value |

`--json` on any command gives machine-readable output. `wwy` is a short alias.

## Configuration

Stored in `~/.waitwithayat/config.json`.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch. `false` makes `open` a no-op. |
| `ayatPerSession` | number | `1` | Ayat to advance per open. |
| `cooldownMinutes` | number | `3` | Minimum gap between opens. |
| `loop` | boolean | `true` | Wrap `114:6 → 1:1` instead of stopping. |
| `source` | string | `quran.com` | Reader site: `quran.com`, `tanzil`, `quranwbw`, `alquran.cloud`. |
| `browser` | string | `""` | Explicit browser command. Empty = OS default opener. |
| `browserArgs` | string | `""` | Extra args for that command. |

```bash
waitwithayat config ayatPerSession 3
waitwithayat config source tanzil
waitwithayat config cooldownMinutes 10
waitwithayat config browser firefox
```

## Turn it off for a while

```bash
waitwithayat config enabled false   # keeps the hook, just goes quiet
waitwithayat config enabled true
```

## Data

`data/surahs.json` holds all 114 surahs with names (transliterated + Arabic),
meanings, and ayah counts using the standard Ḥafṣ / Kūfan numbering (6236 ayat
total). Regenerate with `npm run build-data`.

## Development

```bash
npm test            # node:test, no network, no browser
npm run build-data
```

`src/` is split so each piece is testable on its own:
`quran.js` (metadata + progression maths), `state.js`, `config.js`,
`open.js` (cross-platform launch), `hook.js` (settings.json surgery),
`index.js` (the `open` orchestration).

## License

MIT
