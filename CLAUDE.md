# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                 # install deps (react, ink, htm)
node src/index.js [path]    # run the TUI on [path] (defaults to cwd)
npm start                   # same as: node src/index.js
npm link && disk-reclaim ~  # install globally, then run as `disk-reclaim [path]`

npm test                    # run the test suite (node --test, built-in runner)
node --test --test-name-pattern=humanSize   # run a single test by name
```

There is no build step or linter. Tests use Node's built-in runner (`node:test` + `node:assert`, no devDependencies) and live in `test/*.test.js`, covering the logic/filesystem modules (`format.js`, `reclaim.js`, `scan.js`, `rules.js`, `largest.js`); the `App.js` Ink UI is not yet tested. Source is plain ES modules (`"type": "module"`) run directly by Node.

## Architecture

An Ink (React-for-terminal) TUI, like `ncdu`, that scans a directory tree and lets the user mark items into a "reclaim cart" and batch-delete them. Source is seven ES modules in `src/`:

- **index.js** — CLI entry (`bin: disk-reclaim`, shebang). Shows a loading screen while `scan()` runs, then mounts `App`.
- **scan.js** — recursive tree walk producing `{ name, path, isDir, size, children, parent, error }` nodes.
- **App.js** — the Ink UI and all keyboard handling (`useInput`); owns the core state (`current`, `cursor`, `marked`, `mode`, `view`, `history`) and the scrolling viewport.
- **largest.js** — whole-tree "largest files" walk backing the `L` view.
- **reclaim.js** — deletion + in-place tree math (dedup marks, delete, subtract freed size from ancestors).
- **rules.js** — the auto-mark rule engine (`RULES` registry of regenerable dirs) behind the `r` key.
- **format.js** — display helpers (`humanSize`, `bar`, `barColor`, `relativePath`).
- **boom.js** — procedural full-screen atomic mushroom-cloud animation (`boomGrid`, `BOOM_STEPS`) for the delete-confirmation "explosion". Purely cosmetic; no filesystem effects.

Read the module for its API; the invariants below are what must survive a change.

### Key bindings (defined in App.js `useInput`)
`↑/↓` or `k/j` move · `→/Enter` enter folder · `←/Backspace` up · `g/G` top/bottom · `Space/m` mark · `r` apply rules (auto-mark reclaimable folders) · `l` toggle the largest-files view (top files across the whole tree) · `d` delete marked (confirm with `y`) · `c` clear marks · `?`/`h` help · `q`/`Ctrl+C` quit. In the largest view, `←`/`Backspace` (and `l`) return to browse at the previous folder/cursor; `→`/`Enter` are no-ops.

## Design notes / invariants to preserve

- **Never follow symlinks** in `scan.js` — this is deliberate (correctness of totals + loop safety). Keep using `lstat`.
- **Deletion must not throw** on a single failure. `deleteNodes` collects failures; `App` re-marks only the failed items so the user sees what remained.
- **Tree size updates are in-place** (`removeFromTree`) rather than a rescan — keep this if adding new deletion paths so sizes stay consistent.
- Overlapping marks are deduplicated at delete/count time via `topLevelMarked`, not at mark time.
