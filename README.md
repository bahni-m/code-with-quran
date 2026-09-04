<div align="center">

# 📖 code-with-quran

**Read the Qur'an while Claude Code works.**

Keep a reader pane open next to your session. Start Claude with `claude --cwq`
and, as you work, the reader walks forward through the Qur'an an ayah at a
time — resuming from wherever you last left off.

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![tests](https://img.shields.io/badge/tests-passing-brightgreen)

</div>

---

Claude starts working, the ayah in your other pane moves forward, and you read a
few lines instead of watching a spinner. Read it in a terminal pane, or — since a
terminal grid can't lay out right-to-left Arabic reliably under tmux — in a
bundled browser page (`config surface web`). The whole Uthmani text ships with
the tool (~1.3 MB), so either reader is instant and works offline.

```
                          Al-Baqarah · البقرة · The Cow · Medinan

              وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ
                        وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ
                              حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ ۝٢٥٥

                       █████████░░░░░░░░░░░  34.5%   2150 / 6236
                   j/k move · g goto · f follow · r reload · q quit
```

## Install

Node.js ≥ 18. No runtime dependencies.

```bash
git clone https://github.com/bahni-m/code-with-quran.git
cd code-with-quran
npm link                              # code-with-quran + cwq onto your PATH

code-with-quran shell-init --append   # add the `claude --cwq` wrapper to your shell
code-with-quran install               # add the Claude Code hook
source ~/.bashrc                       # or ~/.zshrc, or restart your shell
```

Both writers back up the file they touch (`*.bak-<timestamp>`).

## Using it day to day

**Terminal or browser?** The terminal reader is the default. It renders Arabic
right-to-left correctly in a terminal that runs the bidi algorithm (most modern
ones) — but **not through tmux or zellij**, which paint text cell-by-cell with no
bidi. If you live in a multiplexer, switch to the browser reader:

```bash
code-with-quran config surface web    # a quiet local page, offline, one tab
```

It uses the same bundled text and follows the same pointer — Arabic just renders
the way a browser always gets right.

**In tmux or zellij (terminal reader)?** `claude --cwq` splits off a reader pane
for you. The first session opens it; later sessions reuse the same pane (one
reader, shared). `code-with-quran status` shows an `Autopane` line. Turn it off
with `code-with-quran config autopane off`.

**Not in a multiplexer?** Open a reader in a pane you can see — a second
terminal, an editor terminal tab — and leave it there:

```bash
code-with-quran read
```

Then start your Claude sessions through the wrapper:

| Command | What happens |
| --- | --- |
| `claude --cwq` | the reader follows this session — each prompt nudges it forward (at most once every few minutes) |
| `claude --cwq-dgr` | same, plus `--dangerously-skip-permissions` |
| `claude` | the reader stays put; move it yourself with the keys below |

`--cwq` / `--cwq-dgr` must come first, before any other argument.

The reader assumes you read what it showed you, so the pointer only drifts if
you skim. Steer it any time:

| Key | Action |
| --- | --- |
| `j` / `→` / `space` | next ayah |
| `k` / `←` | previous ayah |
| `g` | go to a reference (`2:255`, `Al-Kahf`, `baqarah 255`) |
| `f` | toggle follow-mode (jump when the hook advances) |
| `r` | reload from disk |
| `q` / `Esc` | quit |

Away from the reader: `code-with-quran set 2:255` to reposition,
`code-with-quran now` to print the current ayah (handy in a tmux status line),
`code-with-quran status` for progress and activation state.

## Make it yours

Config lives in `~/.code-with-quran/config.json`; set values with
`code-with-quran config <key> <value>`.

| Key | Default | Meaning |
| --- | --- | --- |
| `ayatPerSession` | `1` | Ayat to advance per prompt. |
| `cooldownMinutes` | `3` | Minimum gap between advances, so a burst of quick prompts doesn't run you ahead several ayat. |
| `loop` | `true` | Wrap `114:6 → 1:1` instead of stopping at the end. |
| `enabled` | `true` | Master switch. `false` makes advancing a no-op (the reader still works manually). |
| `surface` | `tui` | Where an advance shows up: `tui` (terminal pane), `web` (bundled browser page), `browser` (an external site), or `both` (tui + web). |
| `autopane` | `auto` | Auto-open the reader pane on `claude --cwq`: `auto` splits a pane when you're in tmux or zellij, `off` never does, `tmux`/`zellij` pin it to one. |
| `direction` | `logical` | How the **terminal** reader emits Arabic. `logical` sends raw text for the terminal to shape and reorder (correct wherever bidi works). `visual` reshapes and reverses it itself, for a bare terminal with no bidi at all. Under tmux/zellij neither is reliable — use `surface web`. |
| `source` | `quran.com` | External site for `surface browser` — `quran.com`, `tanzil`, `quranwbw`, `alquran.cloud`. |
| `browser` | `""` | Explicit browser command. Empty = your OS default. |
| `browserArgs` | `""` | Extra arguments for that command. |

Reading surfaces:

```bash
code-with-quran config surface web       # bundled local page — best for tmux/zellij
code-with-quran config surface both      # terminal pane *and* the web page
code-with-quran config surface browser   # an external site (quran.com etc.) per advance
code-with-quran serve                    # start the web page yourself (prints its URL)
```

The web page binds `127.0.0.1` only, opens one tab, polls the pointer, and shuts
itself down a few minutes after you close the tab.

## Turn it off

```bash
code-with-quran config enabled false   # pause advancing, keep everything installed
code-with-quran uninstall               # remove the Claude Code hook
code-with-quran shell-init --remove      # remove the shell wrapper
```

---

## How it works

```mermaid
flowchart LR
    A["claude --cwq"] -->|exports CODE_WITH_QURAN=1| B[Claude Code session]
    B -->|on each prompt| C[UserPromptSubmit hook]
    C --> D{activated?}
    D -->|yes| E[advance the pointer<br/>once per cooldown]
    D -->|no| F[do nothing]
    E -.->|state.json watch / poll| G["the reader<br/>(terminal pane or browser page)"]
```

Three moving parts:

1. **The shell wrapper** replaces `claude` with a small function. `claude --cwq`
   sets `CODE_WITH_QURAN=1` for that one invocation and runs the real binary via
   `command claude` — no recursion, and the variable never leaks into your
   shell. It also runs `code-with-quran start`, which opens whatever your
   `surface` config asks for — a tmux/zellij pane for `tui`, a browser tab for
   `web`, both for `both` — and is an instant no-op otherwise. `shell-init`
   writes a `claude()` function for bash/zsh and a `function claude` for fish;
   `--shell=…` overrides the `$SHELL` guess.
2. **The hook** runs `code-with-quran open --quiet --session-only` on every
   `UserPromptSubmit`. `--session-only` makes it a no-op unless that variable is
   set. When it does run it advances the pointer in
   `~/.code-with-quran/state.json` — at most once per `cooldownMinutes` — and by
   default does nothing else (`surface = tui`).
3. **The reader** watches `state.json` and jumps to the new ayah whenever the
   pointer moves — from the hook, or from another pane. `code-with-quran read`
   is the terminal reader (navigating with `j`/`k`/`g` writes the pointer back);
   `code-with-quran serve` is the browser reader — a zero-dependency local HTTP
   server on `127.0.0.1` that serves the bundled text as one page and polls the
   pointer. Both are deduped through a heartbeat file: one of each, shared across
   sessions.

## Commands

`cwq` is a short alias. `--json` on any command gives machine-readable output.

| Command | Description |
| --- | --- |
| `read` | Full-screen terminal reader; follows the pointer |
| `serve` | Browser reader — local page on `127.0.0.1`, RTL always right |
| `start` | Open the reader(s) for your `surface` (the wrapper runs this) |
| `open-pane` | Split off a terminal reader pane (tmux / zellij) |
| `now` | Print the current ayah (Arabic + ref) |
| `open` *(default)* | Advance the pointer (+ browser if `surface` includes it) |
| `open --session-only` | No-op unless started via `claude --cwq` (the hook uses this) |
| `open --force` | Ignore the cooldown |
| `peek` | Print the current ayah + URL without advancing |
| `status` | Activation state, reader state, progress, config |
| `set <ref>` | Point at an ayah |
| `next [n]` / `back [n]` | Move the pointer without rendering |
| `reset` | Back to Al-Fatihah 1:1, counters cleared |
| `config [key] [value]` | Get / set configuration |
| `shell-init [--append \| --remove] [--shell=…]` | Manage the `claude` wrapper |
| `install` / `uninstall` | Manage the Claude Code hook |

## The Qur'an text

- `data/quran-uthmani.json` — the full Uthmani text, one entry per ayah (6236).
- `data/surahs.json` — 114 surahs: names (transliterated + Arabic), meanings,
  ayah counts, revelation place.

Text: **Tanzil Project** (Uthmani), CC BY 3.0, retrieved via
[alquran.cloud](https://alquran.cloud). See
[`data/QURAN-TEXT-LICENSE.txt`](data/QURAN-TEXT-LICENSE.txt). To rebuild:

```bash
curl -sS https://api.alquran.cloud/v1/quran/quran-uthmani -o /tmp/u.json
node scripts/build-quran-text.js /tmp/u.json
```

## Development

```bash
npm test          # node:test — no network, no browser, no rc files touched
```

| Module | Responsibility |
| --- | --- |
| `quran.js` | Surah metadata, progression maths (advance/rewind, reference parsing, URLs) |
| `quran-text.js` | Uthmani text lookup |
| `arabic.js` | Zero-dep Arabic shaping + visual reordering for a bare terminal with no bidi |
| `render.js` | Pure frame builder for the terminal reader (width-aware Arabic wrapping) |
| `tui.js` | The terminal reader loop: raw input, state-file watch, alt-screen |
| `web-reader.js` | The browser reader: local HTTP server + self-contained page |
| `pane.js` | Split a reader pane in tmux / zellij (deduped) |
| `state.js` / `config.js` | JSON persistence under `~/.code-with-quran/` |
| `session.js` | The `CODE_WITH_QURAN` activation gate |
| `reader-registry.js` / `web-registry.js` | Heartbeat files so `status` knows a reader is running |
| `open.js` | Cross-platform browser launch |
| `shell.js` | Wrapper generation + rc-file editing |
| `hook.js` | Claude Code `settings.json` install / uninstall |
| `index.js` | Orchestration |

## License

Code: [MIT](LICENSE). Qur'an text: CC BY 3.0 (Tanzil Project).
