---
date: 2026-07-02T09:11:45+00:00
git_commit: ed20816ab0158169cc1381ce534d219f762fb16b
branch: main
topic: "Top N largest files anywhere view"
tags: [plan, largest, App, format, scan]
status: ready
---

# PLAN: "Top N largest files anywhere" view

Add a flat, whole-tree view listing the 50 biggest individual **files** across the entire
scanned tree — so a single giant file buried deep (a log, VM image, video) is visible
without hunting folder by folder. The view reuses the existing cart/marking/deletion
machinery and display helpers; the only new logic is a whole-tree "largest files" walk and
a second render branch plus a view toggle in `App.js`.

Based on research: `docs/agents/research/2026-07-02-top-n-largest-files-view.md`.

## Acceptance Criteria

- Pressing `L` in browse view switches to a "largest files" view; pressing `L`, `←`, or
  `Backspace` returns to browse view with the previous folder cursor restored.
- The largest view shows up to 50 individual files (leaf nodes only — no directories, no
  symlinks) from anywhere in the scanned tree, sorted largest-first.
- Each row shows: cursor marker + mark check, `humanSize`, a bar + percentage scoped to the
  whole tree (`size / root.size`), and the file's path relative to the scan root.
- A header shows the root path + "largest 50 files"; a note indicates the total file count
  when more than 50 files exist.
- Marking (`space`/`m`), delete (`d`→`y`), clear (`c`), rules (`r`), and quit (`q`) work in
  the largest view identically to browse view; `→`/`Enter`/`l` are no-ops there.
- After a deletion while in the largest view, the list reflects the freed space (recomputed
  from the mutated in-memory tree) and the cursor stays in range.
- New `src/largest.js` has unit tests; the full suite (`npm test`) passes.
- `CLAUDE.md` documents the new module and the `L` key binding.

## Technical Key Decisions and Tradeoffs

1. **Separate `view` state (`'browse' | 'largest'`), orthogonal to `mode`.**
   - Why: keeps the existing deletion state machine (`browse`/`confirm`/`deleting`)
     untouched; the two axes compose (e.g. you can delete from either view).
   - Impact: `rows` is selected by `view`; a few `useInput` branches gate on `view`.

2. **Toggle key `L`; `←`/`Backspace` also exit; `→`/`Enter`/`l` are no-ops in largest view.**
   - Why: natural "back" gesture; there is nothing to "open" on a file.
   - Impact: small additions to the single `useInput` dispatcher.

3. **Files only, capped at N = 50, largest-first.**
   - Why: a focused "top offenders" list; bounded sort/render work on huge trees.
   - Impact: new `largestFiles(root, n = 50)` filters `!isDir` and returns the top `n`.

4. **Row = markers + `humanSize` + `bar(size / root.size)` % + `relativePath(root.path, path)`.**
   - Why: a cross-tree list needs the location shown, and there is no single parent folder
     to scope the percentage to, so scope it to the whole tree.
   - Impact: a second row-render branch in `App.js`; reuses existing `format.js` helpers.

5. **New module `src/largest.js` + `test/largest.test.js`, computed on render.**
   - Why: mirrors `rules.js` (an isolated, unit-tested whole-tree walk returning `node[]`);
     computing during render when `view === 'largest'` avoids any stale cache after deletes.
   - Impact: `largestFiles(root, 50)` is called during render only while in largest view.

6. **Cursor preserved via the existing `history` Map; reset to 0 when entering largest.**
   - Why: keep the user's place in the folder tree across a peek at the largest files;
     reuse machinery that already exists.
   - Impact: save/restore cursor in the `L` toggle and the back-exit branches.

## Current State

`App.js` holds all UI state and rendering. The visible list is **always** the current
folder's direct children, sorted largest-first:

```
App.js state:  current(folder)  cursor  marked(Map path→node)  mode(browse|confirm|deleting)  history(Map path→cursor)
                     │
   rows = sortedChildren(current)          ◄── ALWAYS current.children (App.js:32)
                     │
   total = current.size                    ◄── bar/percentage denominator (App.js:33)
                     │
   windowFor(cursor, rows.length, viewHeight) → visible slice → per-row <Text>
                     │
   row: ▶ ✓  humanSize(size)  bar(size/total) %   /name   (basename only, App.js:142-155)
```

- The whole tree is in memory after `scan()`; every file node is
  `{ name, path, isDir, size, children, parent, error }` with an accurate `size`
  (`src/scan.js:25`, `:35-40`). Symlinks are never nodes (`src/scan.js:54-55`).
- `findMatches(root)` (`src/rules.js:23-35`) is the existing precedent for a whole-tree walk
  returning a flat `node[]`; `r` → `applyRules()` (`src/App.js:51-69`) is the precedent for a
  keyboard action operating on the whole tree (`root`, not `current`).
- The cart is view-independent: `marked` Map keyed by `node.path` (`src/App.js:27`),
  `toggleMark(node)` (`:71-78`), `topLevelMarked` dedup (`src/reclaim.js:8-19`), deletion +
  in-place size updates via `removeFromTree` (`src/reclaim.js:49-55`).
- Display helpers: `humanSize`, `bar`, and `relativePath(rootPath, nodePath)`
  (`src/format.js:6-24`). `relativePath` is currently used only for cart rows (`App.js:167`).
- Keyboard handling is one `useInput` callback (`src/App.js:98-124`); `enter`/`goUp` maintain
  the `history` cursor map (`:36-49`).

## Desired End State

A `view` axis is added. In `largest` view, `rows` is the flat top-50 files list and the row
render + header/footer change; everything else (cart, delete, rules, quit) is shared.

```
                       L (toggle)
      browse view  ⇄  largest view
        │                   │
 rows = sortedChildren   rows = largestFiles(root, 50)     ◄── new src/largest.js
        │                   │
 total = current.size    total = root.size
        │                   │
 row: /name (basename)   row: relativePath(root.path, path)   ◄── shows deep location
        │                   │
 ← up a folder           ← / Backspace exit to browse
 →/Enter open folder     →/Enter/l no-op
```

Proposed largest-view rendering (browse row shown for contrast):

```
 Browse view (today):
 ▶✓   1.2 GB [#####     ]  42%   /videos

 Largest view (new):
  /home/me/proj — largest 50 files (of 8,412 files)

 ▶✓   1.2 GB [##        ]  12%   Downloads/vm/ubuntu.img
 ✓    900 MB [#         ]   9%   logs/app/2026-06.log
      512 MB [          ]   5%   media/clips/render.mov
 …
 space mark · d delete cart · c clear · ↑↓ move · ← back · L browse · q quit
```

## Abstractions and Code Reuse

Reused as-is: `humanSize`, `bar`, `relativePath` (`format.js`); the whole cart pipeline —
`toggleMark`, `topLevelMarked`, `reclaimableBytes`, `deleteNodes`, `removeFromTree`; the
`windowFor` viewport and cursor-clamp logic; the `history` cursor map; the `applyRules`
whole-tree pattern (as a model). `largestFiles` follows the `findMatches` recursive-walk
shape but descends fully and collects leaf files.

- `src`
  - `largest.js` *(new)* — whole-tree "largest files" walk
    - `largestFiles(root, n = 50)` — collect `!isDir` leaf nodes, sort by `size` desc, take `n`
    - `countFiles(root)` — total number of leaf files in the tree (for the header note)
  - `App.js` — add the largest view
    - `view` state — new `useState('browse')`
    - `rows` selection — `view === 'largest' ? largestFiles(root, 50) : sortedChildren(current)`
    - `total` selection — `view === 'largest' ? (root.size || 1) : (current.size || 1)`
    - `useInput` — `L` toggle (+ save/restore cursor via `history`); gate `enter`/`goUp` and
      `←`/`Backspace` on `view`
    - render — header branch, per-row branch (relativePath vs basename), footer branch
  - `format.js` — unchanged (helpers reused)
- `test`
  - `largest.test.js` *(new)* — unit tests for `largestFiles` (mirrors `rules.test.js` style)
- `CLAUDE.md` — document `src/largest.js` and the `L` binding

## Logging & Observability

None. This is a local TUI with no logging layer; feedback is the on-screen `status` line and
the rendered list, consistent with the rest of the app.

## Implementation

### Phase 1: `largestFiles` traversal module

Dependencies: None.

Add the pure whole-tree walk that returns the biggest files, with unit tests. This mirrors
`src/rules.js` / `test/rules.test.js` (isolated, fully unit-testable, no UI).

**Tasks**:
- [x] Create `src/largest.js` exporting `largestFiles(root, n = 50)` and `countFiles(root)`:
  - `largestFiles`: recursively walk from `root` (like `findMatches`), but descend fully and
    collect only leaf **file** nodes (`!node.isDir`). Do not collect directories. Sort by
    `size` descending and return the first `n`.
  - `countFiles`: same walk, returning the total count of leaf files (used for the header
    "(of N files)" note; kept as its own small exported function so it is unit-testable).
  - Real scan nodes always have `children: []` (even on error, per `scan.js:25`,`:49`), so no
    missing-`children` guard is needed; keep only the null-node guard.
  - Note: symlinks never appear (scan omits them); error/zero-size files sort to the bottom
    naturally and are not specially filtered.
  ```js
  export function largestFiles(root, n = 50) {
    const files = [];
    const visit = (node) => {
      if (!node) return;
      if (!node.isDir) { files.push(node); return; }
      for (const child of node.children) visit(child);
    };
    visit(root);
    files.sort((a, b) => b.size - a.size);
    return files.slice(0, n);
  }

  export function countFiles(root) {
    let count = 0;
    const visit = (node) => {
      if (!node) return;
      if (!node.isDir) { count += 1; return; }
      for (const child of node.children) visit(child);
    };
    visit(root);
    return count;
  }
  ```
- [x] Create `test/largest.test.js`. Adapt the `node()` helper from `test/rules.test.js`, but
  **extend it to accept a `size` option** (the rules tests never set `size`, so the original
  helper defaults `size: 0` and cannot express sort order), e.g.
  `node(name, { isDir, size = 0, children } = {})`. Cover:
  - `largestFiles`: collects files from several levels deep, sorted largest-first (needs sizes)
  - `largestFiles`: excludes directories (only leaf files returned)
  - `largestFiles`: respects the `n` cap (build 5 files, `largestFiles(tree, 3)` → 3 biggest)
  - `largestFiles`: returns `[]` for a tree with no files (only empty dirs)
  - `largestFiles`: default `n = 50` when called with a single argument
  - `largestFiles`: a root that is itself a single file returns `[thatFile]`
  - `countFiles`: returns the total leaf-file count (nested), and `0` for a dir-only tree

**Automated Verification**:
- [x] `node --test test/largest.test.js` passes
- [x] `npm test` passes (whole suite, no regressions)

### Phase 2: Largest-files view in `App.js`

Dependencies: Phase 1.

Wire the module into the UI: a `view` toggle, list/denominator selection, the new row
render, header/footer, cursor save/restore, and correct behavior after deletion. Update docs.

**Tasks**:
- [x] Import `largestFiles` and `countFiles` from `./largest.js` in `src/App.js`.
- [x] Add `const [view, setView] = useState('browse');`.
- [x] Select the row list and denominator by `view`:
  ```js
  const rows = view === 'largest' ? largestFiles(root, 50) : sortedChildren(current);
  const total = (view === 'largest' ? root.size : current.size) || 1;
  ```
  (Replaces the current `rows`/`total` at `App.js:32-33`. `largestFiles` runs each render
  only while in largest view, so it reflects the tree after any `removeFromTree`.)
- [x] Add an `L` toggle in `useInput` (browse mode). Entering largest: save the browse cursor
  to `history` for `current.path`, then `setCursor(0)`. Exiting: restore
  `history.get(current.path) ?? 0`:
  ```js
  else if (input === 'L') {
    if (view === 'browse') { history.set(current.path, cursor); setView('largest'); setCursor(0); }
    else { setView('browse'); setCursor(history.get(current.path) ?? 0); }
  }
  ```
- [x] Gate navigation on `view` in `useInput`:
  - `→`/`Enter`/`l`: only call `enter(rows[cursor])` when `view === 'browse'` (no-op in largest).
  - `←`/`h`/`Backspace`/`Delete`: when `view === 'largest'`, exit to browse (same restore as
    the `L` exit); when `view === 'browse'`, keep `goUp()`.
  - `↑↓`/`k`/`j`, `g`/`G`, `space`/`m`, `r`, `c`, `d`, `q` remain unchanged (they already act
    on `rows`/`marked`, which now carry the largest-view items).
- [x] Header render: when `view === 'largest'`, show `root.path` + `largest 50 files` and a
  `(of N files)` note, where `N = countFiles(root)` (from Phase 1). Only show the note when
  `N > 50`. Example:
  ```
  <root.path> — largest 50 files (of 8,412 files)
  ```
- [x] Per-row render: when `view === 'largest'`, render the location via
  `relativePath(root.path, child.path)` instead of `/name`, and keep the markers +
  `humanSize` + `bar(child.size / total)` + `%` columns. Keep the browse row branch as-is.
  Files are never dirs here, so omit the `/` dir prefix in this branch.
- [x] Footer render: when `view === 'largest'`, show
  `space mark · d delete cart · c clear · ↑↓ move · ← back · L browse · q quit`; in browse
  view append `L largest` to the existing hint line.
- [x] Confirm cursor clamping after deletion covers both views: the existing
  `setCursor((c) => Math.min(c, Math.max(0, sortedChildren(current).length - 1)))` in
  `performDelete` (`App.js:90`) is browse-scoped. Update it to clamp against the active
  view's row count (compute the active length from `view`) so the cursor stays in range after
  deleting from the largest view.
- [x] Update `CLAUDE.md`:
  - Architecture: add a bullet for `src/largest.js` (`largestFiles(root, n)` — whole-tree
    top-N files walk) and mention the `view` axis in the `App.js` bullet.
  - Key bindings: add `L largest (top files across the whole tree)` and the `← back` behavior
    in the largest view.

**Automated Verification**:
- [x] `npm test` passes (no regressions; `largest.js` covered by Phase 1 tests).
- [x] `node -e "import('./src/App.js').then(()=>console.log('ok'))"` imports without error
  (module wiring / syntax sanity).

**Manual Verification**:
- [x] `node src/index.js <a large tree>`: press `L` — the view switches to a flat list of the
  50 biggest files with paths relative to the root; press `L`/`←` — returns to the same folder
  and cursor position as before.
- [x] In the largest view, `space` marks a file into the cart and `d`→`y` deletes it; the
  freed space is reflected and the list/cursor stay valid afterward.
- [x] `→`/`Enter` do nothing in the largest view; `↑↓`/`g`/`G` move within the 50 rows; the
  header shows the total file count and the footer shows the largest-view hints.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- Research: `docs/agents/research/2026-07-02-top-n-largest-files-view.md`
- Precedent walk: `src/rules.js:23-35` (`findMatches`) and `test/rules.test.js`
- Cart/deletion pipeline: `src/reclaim.js:8-55`; `src/App.js:71-96`
- Display helpers: `src/format.js:6-24`
- Row render + viewport + keys: `src/App.js:11-21`, `:32-33`, `:98-124`, `:142-183`
</content>
</invoke>
