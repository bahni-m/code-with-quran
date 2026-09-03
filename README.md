# code-with-quran

> Turn the wait into worship. When you start a Claude Code session with
> `claude --cwq`, every prompt opens the Qur'an in your browser — picking up
> from the ayah **after** the last one it showed you.

No dashboards, no streak-shaming. Claude starts working → a tab opens at your
next ayah → you read a few lines instead of watching a spinner. On a plain
`claude` (no `--cwq`), it stays completely silent.

---

## How it works

Two pieces:

1. **A shell wrapper** around `claude`. `claude --cwq` exports `CODE_WITH_QURAN=1`
   and then runs the real `claude`. `claude --cwq-dgr` does the same *and* adds
   `--dangerously-skip-permissions`.
2. **A Claude Code hook** on `UserPromptSubmit` that runs
   `code-with-quran open --quiet --session-only`. The `--session-only` flag makes
   it a no-op unless `CODE_WITH_QURAN=1` is in the environment — i.e. unless the
   session was started through the wrapper.

`code-with-quran` keeps a single pointer (`surah:ayah`) in
`~/.code-with-quran/state.json`. On each open it:

1. opens your browser at the current pointer (e.g. `quran.com/2/255`)…
2. …then advances by `ayatPerSession` ayat (default: 1), crossing surah
   boundaries and wrapping `114 → 1` when you finish.

A cooldown (default: 3 minutes) means rapid back-to-back prompts won't bury you
in tabs. It can't know exactly which ayah you stopped on, so it assumes you read
what it showed. Drifted? `code-with-quran set 2:255` fixes the pointer.

## Install

Requires Node.js ≥ 18. Zero runtime dependencies.

```bash
git clone https://github.com/bahni-m/code-with-quran.git
cd code-with-quran
npm link          # puts `code-with-quran` (and `cwq`) on your PATH
```

Then wire up both pieces:

```bash
code-with-quran shell-init --append   # adds the claude --cwq wrapper to your rc file
code-with-quran install               # adds the Claude Code hook (~/.claude/settings.json)
source ~/.bashrc                       # or ~/.zshrc / restart your shell
```

Both writers back up the file they touch (`*.bak-<timestamp>`).

## Use it

```bash
claude --cwq                  # normal session, Qur'an enabled
claude --cwq-dgr              # + --dangerously-skip-permissions
claude                        # nothing happens — code-with-quran stays silent
```

`--cwq` / `--cwq-dgr` must be the **first** argument.

## Uninstall

```bash
code-with-quran uninstall              # removes the hook
code-with-quran shell-init --remove    # removes the wrapper
```

## The shell wrapper

`code-with-quran shell-init` prints the wrapper; `--append` writes it, `--remove`
takes it back out. Target shell is detected from `$SHELL`; override with
`--shell=bash|zsh|fish`. bash/zsh use a `claude()` function; fish uses a
`function claude`. In every case the real binary is reached via `command claude`,
so there's no recursion, and the env var is scoped to that one invocation.

```sh
claude() {
  case "${1:-}" in
    --cwq)     shift; CODE_WITH_QURAN=1 command claude "$@" ;;
    --cwq-dgr) shift; CODE_WITH_QURAN=1 command claude --dangerously-skip-permissions "$@" ;;
    *)         command claude "$@" ;;
  esac
}
```

## Commands

| Command | What it does |
| --- | --- |
| `code-with-quran` / `… open` | Open the current ayah, then advance the pointer |
| `… open --session-only` | No-op unless started via `claude --cwq` (the hook uses this) |
| `… open --force` | Ignore the cooldown |
| `… open --dry-run` | Show what would happen; open nothing, save nothing |
| `… peek` | Print the current ayah + URL, no open, no advance |
| `… status` | Activation state, progress bar, open count, config |
| `… set <ref>` | Point at an ayah — `2:255`, `Al-Kahf`, `baqarah 255` |
| `… next [n]` / `… back [n]` | Nudge the pointer without opening a browser |
| `… reset` | Back to Al-Fatihah 1:1, counters cleared |
| `… config [key] [value]` | Get / set configuration |
| `… shell-init [--append\|--remove] [--shell=…]` | Manage the `claude` wrapper |
| `… install` / `… uninstall` | Manage the Claude Code hook |

`--json` on any command gives machine-readable output. `cwq` is a short alias.

## Configuration

Stored in `~/.code-with-quran/config.json`.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch. `false` makes `open` a no-op even when activated. |
| `ayatPerSession` | number | `1` | Ayat to advance per open. |
| `cooldownMinutes` | number | `3` | Minimum gap between opens. |
| `loop` | boolean | `true` | Wrap `114:6 → 1:1` instead of stopping. |
| `source` | string | `quran.com` | Reader site: `quran.com`, `tanzil`, `quranwbw`, `alquran.cloud`. |
| `browser` | string | `""` | Explicit browser command. Empty = OS default opener. |
| `browserArgs` | string | `""` | Extra args for that command. |

```bash
code-with-quran config ayatPerSession 3
code-with-quran config source tanzil
code-with-quran config cooldownMinutes 10
code-with-quran config browser firefox
```

## Data

`data/surahs.json` holds all 114 surahs with names (transliterated + Arabic),
meanings, and ayah counts using the standard Ḥafṣ / Kūfan numbering (6236 ayat
total). Regenerate with `npm run build-data`.

## Development

```bash
npm test            # node:test — no network, no browser, no shell rc touched
npm run build-data
```

`src/` is split so each piece is testable on its own: `quran.js` (metadata +
progression maths), `state.js`, `config.js`, `session.js` (the activation gate),
`open.js` (cross-platform launch), `shell.js` (wrapper generation + rc editing),
`hook.js` (settings.json surgery), `index.js` (the `open` orchestration).

## License

MIT
