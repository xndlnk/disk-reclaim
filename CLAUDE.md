# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # install deps (react, ink, htm)
node src/index.js [path]    # run the TUI on [path] (defaults to cwd)
node src/index.js --no-sound # run without the delete boom sound (also: DISK_RECLAIM_SOUND=0)
npm start                   # same as: node src/index.js
npm link && disk-reclaim ~  # install globally, then run as `disk-reclaim [path]`

npm test                    # run the test suite (node --test, built-in runner)
node --test --test-name-pattern=humanSize   # run a single test by name
```

There is no build step or linter. Tests use Node's built-in runner (`node:test` + `node:assert`, no devDependencies) and live in `test/*.test.js`, covering the logic/filesystem modules (`format.js`, `reclaim.js`, `scan.js`, `rules.js`, `largest.js`) and the pure UI screens (`HelpScreen.js`, `ExplosionScreen.js`, `BrowseView.js`). The pure screens are rendered to plain text via `test-support/render.js` (mounts an Ink element against a fake stdout and strips ANSI — no test-renderer dependency); that helper lives outside `test/` so the runner doesn't collect it as a test file. Only the stateful `App.js` container (state + `useInput`) is not yet tested. Source is plain ES modules (`"type": "module"`) run directly by Node.

## Architecture

An Ink (React-for-terminal) TUI, like `ncdu`, that scans a directory tree and lets the user mark items into a "reclaim cart" and batch-delete them. Source is eleven ES modules under `src/`, grouped into three folders (plus the entry point at the root):

**`src/index.js`** — CLI entry (`bin: disk-reclaim`, shebang). Shows a loading screen while `scan()` runs, then mounts `App`.

**`src/ui/`** — the Ink (React) components:
- **App.js** — the container: owns all state (`current`, `cursor`, `marked`, `mode`, `view`, `history`) and keyboard handling (`useInput`), then delegates rendering to one of three presentational screens by mode/`showHelp`. Note `mode` (`browse`/`confirm`/`exploding`/`boom-done`) and `view` (`tree`/`largest`) are two independent axes.
- **BrowseView.js** — the main browse UI (scrolling list + reclaim-cart sidebar + footer). Pure/presentational; derives its own display data (visible window, cart totals) from props.
- **HelpScreen.js** — the static full-screen help overlay (key bindings + rules explanation). Pure.
- **ExplosionScreen.js** — renders a single mushroom-cloud frame from `boom.js` and, on the last frame, the "reclaimed" summary plate. Pure.

**`src/core/`** — the filesystem + logic (no UI, no React):
- **scan.js** — recursive tree walk producing `{ name, path, isDir, size, children, parent, error }` nodes.
- **largest.js** — whole-tree "largest files" walk backing the `L` view.
- **reclaim.js** — deletion + in-place tree math (dedup marks, delete, subtract freed size from ancestors).
- **rules.js** — the auto-mark rule engine (`RULES` registry of regenerable dirs) behind the `r` key.

**`src/util/`** — pure presentation/cosmetic helpers:
- **format.js** — display helpers (`humanSize`, `bar`, `barColor`, `relativePath`).
- **boom.js** — procedural full-screen atomic mushroom-cloud animation (`boomGrid`, `BOOM_STEPS`) for the delete-confirmation "explosion". Purely cosmetic; no filesystem effects.
- **sound.js** — `playBoom()`, a fire-and-forget boom sound that shells out to the OS audio player (`afplay`/`paplay`/`aplay`/`ffplay`/`play`/PowerShell). Fails silently if no player or audio device; muted by `--no-sound` (passed as App's `sound` prop) or `DISK_RECLAIM_SOUND=0`. The `assets/boom.wav` it plays is synthesized by `scripts/gen-boom.mjs` (`npm run gen:boom`).

Read the module for its API; the invariants below are what must survive a change.

### Key bindings (defined in App.js `useInput`)
`↑/↓` or `k/j` move · `→/Enter` enter folder · `←/Backspace` up · `g/G` top/bottom · `Space/m` mark · `r` apply rules (auto-mark reclaimable folders) · `l` toggle the largest-files view (top files across the whole tree) · `d` delete marked (confirm with `y`) · `c` clear marks · `?`/`h` help · `q`/`Ctrl+C` quit. In the largest view, `←`/`Backspace` (and `l`) return to browse at the previous folder/cursor; `→`/`Enter` are no-ops.

## Design notes / invariants to preserve

- **Never follow symlinks** in `scan.js` — this is deliberate (correctness of totals + loop safety). Keep using `lstat`.
- **Deletion must not throw** on a single failure. `deleteNodes` collects failures; `App` re-marks only the failed items so the user sees what remained.
- **Tree size updates are in-place** (`removeFromTree`) rather than a rescan — keep this if adding new deletion paths so sizes stay consistent.
- Overlapping marks are deduplicated at delete/count time via `topLevelMarked`, not at mark time.
