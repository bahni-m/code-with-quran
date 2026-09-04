<div align="center">

# 📖 code-with-quran

**Read the Qur'an while Claude Code works.**

Start a session with `claude --cwq` and a reader beside it walks forward through
the Qur'an — one ayah per prompt, resuming from wherever you left off. Read it in
a terminal pane or a browser tab.

![license](https://img.shields.io/badge/license-MIT-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![tests](https://img.shields.io/badge/tests-passing-brightgreen)

</div>

---

Claude starts working, the ayah in your other pane moves forward, and you read a
few lines instead of watching a spinner. The whole Uthmani text ships with the
tool (Tanzil Project, ~1.3 MB), so the reader is instant and works offline.

```
                          Al-Baqarah · البقرة · The Cow · Medinan

              وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ
                        وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ
                              حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ ۝٢٥٥

                       █████████░░░░░░░░░░░  34.5%   2150 / 6236
                   j/k move · g goto · f follow · r reload · q quit
```

## Quickstart

Node.js ≥ 18. No runtime dependencies.

```bash
git clone https://github.com/bahni-m/code-with-quran.git
cd code-with-quran
npm link                              # puts `code-with-quran` (and `cwq`) on your PATH

code-with-quran shell-init --append   # add the `claude --cwq` wrapper to your shell
code-with-quran install               # add the Claude Code hook
source ~/.bashrc                       # or ~/.zshrc — or open a new shell
```

Now start Claude through the wrapper:

```bash
claude --cwq            # the reader follows this session
```

Both writers back up the file they touch (`*.bak-<timestamp>`).

## Reading it

Two readers — same text, same pointer, same keys. Pick whichever you'll actually
look at:

- **Browser** — a quiet local page. The safe choice: right-to-left Arabic always
  renders correctly. Turn it on with `code-with-quran config surface web`, or for
  a single session start with `claude --cwq-browser`.
- **Terminal** — a full-screen pane (the default). Good in a terminal that lays
  out right-to-left text — but **not through tmux or zellij**
  ([why](#if-the-arabic-looks-scrambled)). Inside tmux/zellij, `claude --cwq`
  splits the pane for you; otherwise open one yourself in a spare pane:

  ```bash
  code-with-quran read
  ```

### Starting a session

| Command | What happens |
| --- | --- |
| `claude --cwq` | the reader follows this session — one ayah per prompt |
| `claude --cwq-browser` | same, but read in the browser this session (no config change) |
| `claude --cwq-dgr` · `claude --cwq-dgr-browser` | as above, plus `--dangerously-skip-permissions` |
| `claude` | untouched — the reader stays where it is |

The `--cwq…` flag must come first, before any other argument.

### Keys

The reader assumes you read what it showed you, so the pointer only drifts if you
skim. Steer it any time — **the same keys in the terminal reader and the browser
page**:

| Key | Action |
| --- | --- |
| `j` / `→` / `space` | next ayah |
| `k` / `←` | previous ayah |
| `g` | jump to a reference (`2:255`, `Al-Kahf`, `baqarah 255`) |
| `f` | follow on/off (whether the view jumps when Claude advances) |
| `r` | reload from disk |
| `q` / `Esc` | quit (a browser tab may need a manual close) |

### From anywhere

```bash
code-with-quran status          # progress, which readers are up, activation state
code-with-quran set 2:255       # move the pointer
code-with-quran now             # print the current ayah (handy in a tmux status line)
```

## Settings

Config lives in `~/.code-with-quran/config.json`; set values with
`code-with-quran config <key> <value>`.

| Key | Default | Meaning |
| --- | --- | --- |
| `surface` | `tui` | Where an advance shows up: `tui` (terminal pane), `web` (bundled browser page), `browser` (an external site), or `both` (tui + web). |
| `ayatPerSession` | `1` | Ayat to advance per prompt. |
| `cooldownMinutes` | `0` | Minimum minutes between advances. `0` means every prompt advances. Raise it if quick bursts of prompts run you ahead of what you've read. |
| `loop` | `true` | Wrap `114:6 → 1:1` instead of stopping at the end. |
| `enabled` | `true` | Master switch. `false` makes advancing a no-op (the reader still works manually). |
| `autopane` | `auto` | Auto-open the terminal reader pane on `claude --cwq`: `auto` splits a pane when you're in tmux or zellij, `off` never does, `tmux`/`zellij` pin it to one. |
| `direction` | `logical` | How the **terminal** reader emits Arabic. `logical` sends raw text for the terminal to shape and reorder; `visual` reshapes and reverses it in code for a bare terminal with no bidi. See [If the Arabic looks scrambled](#if-the-arabic-looks-scrambled). |
| `source` | `quran.com` | External site for `surface browser` — `quran.com`, `tanzil`, `quranwbw`, `alquran.cloud`. |
| `browser` | `""` | Explicit browser command. Empty = your OS default. |
| `browserArgs` | `""` | Extra arguments for that command. |

```bash
code-with-quran config surface web       # browser reader — best under tmux/zellij
code-with-quran config surface both      # terminal pane *and* the browser page
code-with-quran config surface browser   # an external site (quran.com etc.), a tab per advance
```

The browser page binds `127.0.0.1` only, opens one tab, follows the pointer, and
shuts itself down a few minutes after you close the tab.

## If the Arabic looks scrambled

You're almost certainly reading in a terminal, under tmux or zellij. A terminal
grid can't lay out right-to-left Arabic reliably, and **tmux and zellij make it
worse**: they paint text cell by cell with no bidi algorithm, so the terminal
underneath never gets to reorder a whole line. You'll see words in left-to-right
order, the ayah-end marker on the wrong side, or — with `direction: visual` —
half-reversed text.

Don't fight it. Read in the browser:

```bash
code-with-quran config surface web       # persistent
claude --cwq-browser                     # or just this session
```

Same text, same pointer, same keys — rendered the way a browser always gets
right.

The terminal reader is fine **outside** a multiplexer, in a terminal that runs
the bidi algorithm itself — most modern ones do (`direction: logical`, the
default). `direction: visual` reshapes and reverses each line in code for a bare
terminal with no bidi at all, like plain xterm; it is not a tmux workaround.

## Uninstalling

```bash
code-with-quran config enabled false   # just pause advancing, keep everything installed
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
    D -->|yes| E[advance the pointer<br/>one ayah]
    D -->|no| F[do nothing]
    E -.->|state.json watch / poll| G["the reader<br/>(terminal pane or browser page)"]
```

Three moving parts:

1. **The shell wrapper** replaces `claude` with a small function. `claude --cwq`
   sets `CODE_WITH_QURAN=1` for that one invocation and runs the real binary via
   `command claude` — no recursion, and the variable never leaks into your
   shell. `--cwq-browser` additionally sets `CODE_WITH_QURAN_SURFACE=web` so that
   one session reads in the browser. It also runs `code-with-quran start`, which
   opens whatever the surface asks for — a tmux/zellij pane for `tui`, a browser
   tab for `web`, both for `both` — and is an instant no-op otherwise.
   `shell-init` writes a `claude()` function for bash/zsh and a `function claude`
   for fish; `--shell=…` overrides the `$SHELL` guess.
2. **The hook** runs `code-with-quran open --quiet --session-only` on every
   `UserPromptSubmit`. `--session-only` makes it a no-op unless that variable is
   set. When it does run it advances the pointer in
   `~/.code-with-quran/state.json` — once per prompt, or once per
   `cooldownMinutes` if you set one — and by default does nothing else
   (`surface = tui`).
3. **The reader** watches `state.json` and jumps to the new ayah whenever the
   pointer moves — from the hook, or from another pane. `code-with-quran read`
   is the terminal reader (navigating with `j`/`k`/`g` writes the pointer back);
   `code-with-quran serve` is the browser reader — a zero-dependency local HTTP
   server on `127.0.0.1` that serves the bundled text as one page and polls the
   pointer. Both are deduped through a heartbeat file: one of each, shared across
   sessions.

## Command reference

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
