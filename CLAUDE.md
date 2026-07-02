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

An Ink (React-for-terminal) TUI, like `ncdu`, that scans a directory tree and lets the user mark items into a "reclaim cart" and batch-delete them. Six files in `src/`:

- **index.js** — CLI entry (`bin: disk-reclaim`, shebang). Reads target from `argv[2]` or cwd, renders a live loading screen while `scan()` runs, then unmounts it and mounts `App` with the scanned tree.
- **scan.js** — `scan(dir, onProgress)` recursively walks the tree. Key invariants: uses `fs.lstat` (never follows symlinks — they get their own tiny size, avoiding double-counting and loops); directory sizes are summed bottom-up; permission errors are stored on the node's `error` field instead of thrown. Nodes are `{ name, path, isDir, size, children, parent, error }`.
- **App.js** — the interactive UI and all keyboard handling (`useInput`). Holds the core state: `current` folder, `cursor`, `marked` (Map path→node), `mode` (`browse` | `confirm` | `deleting`), `view` (`browse` | `largest`, orthogonal to `mode`), and `history` (folder→cursor position). Renders children sorted largest-first through a scrolling viewport (`windowFor`). The `view` axis selects the row list: `browse` shows the current folder's children; `largest` shows the whole-tree top-50 files (`largestFiles(root, 50)`) with root-relative paths. The cart/delete/rules machinery is shared across both views.
- **largest.js** — whole-tree "largest files" walk (mirrors `rules.js`). `largestFiles(root, n = 50)` descends fully, collects leaf file nodes (`!isDir`), and returns the `n` biggest largest-first. `countFiles(root)` returns the total leaf-file count for the header note. Computed on render while in largest view, so it always reflects the tree after any `removeFromTree`.
- **reclaim.js** — deletion + tree math. `topLevelMarked()` dedups overlapping marks (a file inside a marked folder is dropped). `deleteNodes()` does `fs.rm(..., {recursive, force})` and never throws — returns `{deleted, failed}`. `removeFromTree()` splices a node and subtracts its size from every ancestor in O(depth) so freed space shows immediately without rescanning.
- **rules.js** — the auto-mark rule engine. `RULES` is an extensible registry (`{ id, label, match(node) }`) of regenerable directories (node_modules, dist, build, .next, target, __pycache__, .gradle). `findMatches(root)` walks the whole tree and returns matched nodes, stopping descent at each match so nested duplicates don't accumulate. `App.js` binds this to `r`, merging matches into the `marked` cart.
- **format.js** — display helpers: `humanSize(bytes)`, `bar(fraction, width)`, and `relativePath(rootPath, nodePath)` (a node's path relative to the scanned root, used to label cart items).

### Key bindings (defined in App.js `useInput`)
`↑/↓` or `k/j` move · `→/Enter/l` enter folder · `←/Backspace/h` up · `g/G` top/bottom · `Space/m` mark · `r` apply rules (auto-mark reclaimable folders) · `L` toggle the largest-files view (top files across the whole tree) · `d` delete marked (confirm with `y`) · `c` clear marks · `q`/`Ctrl+C` quit. In the largest view, `←`/`Backspace` (and `L`) return to browse at the previous folder/cursor; `→`/`Enter`/`l` are no-ops.

## Design notes / invariants to preserve

- **Never follow symlinks** in `scan.js` — this is deliberate (correctness of totals + loop safety). Keep using `lstat`.
- **Deletion must not throw** on a single failure. `deleteNodes` collects failures; `App` re-marks only the failed items so the user sees what remained.
- **Tree size updates are in-place** (`removeFromTree`) rather than a rescan — keep this if adding new deletion paths so sizes stay consistent.
- Overlapping marks are deduplicated at delete/count time via `topLevelMarked`, not at mark time.
