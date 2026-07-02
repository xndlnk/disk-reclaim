---
date: 2026-07-02T08:57:38+00:00
git_commit: ed20816ab0158169cc1381ce534d219f762fb16b
branch: main
topic: "Top N largest files anywhere view — existing code that a flat largest-files list would build on"
tags: [research, codebase, scan, App, format, reclaim, rules, tree-traversal, rendering]
status: complete
---

# Research: "Top N largest files anywhere" view — existing codebase map

## Research Question

> I need research to implement this new feature: "Top N largest files anywhere" view — a
> flat list of the biggest individual files across the whole tree, not just per-folder.
> Often the offender is one giant file (a log, a VM image, a video) buried deep.

**Scope note:** This document describes *what exists today* in the codebase that such a
feature would touch or reuse. It does **not** design, plan, or recommend the feature. It
is a technical map to hand to a follow-up planning step (e.g. `/rpi-plan`).

## Summary

`disk-reclaim` is an Ink (React-for-terminal) TUI modeled on `ncdu`. It scans a directory
tree once into an in-memory node graph, then lets the user browse **one folder at a time**,
mark items into a "reclaim cart", and batch-delete them. All of the ingredients a flat
"largest files anywhere" view would need already exist in isolated, reusable form:

- A **fully-materialized tree** in memory after the initial scan (`scan.js`), where every
  node carries `size`, `isDir`, `path`, `parent`, and `children`.
- A precedent for **whole-tree traversal producing a flat node list** — `findMatches(root)`
  in `rules.js` walks the entire tree from the scan root and returns a flat array of nodes.
  This is the closest existing analogue to "collect nodes across the whole tree".
- A **cart / marking system** keyed by `node.path` (`marked` Map in `App.js`) that is
  view-agnostic — it stores nodes, not positions, so nodes surfaced by any view can be
  marked with the same code.
- **Display helpers** for exactly the columns a flat list needs: `humanSize`, `bar`, and
  crucially `relativePath(root.path, nodePath)` which already renders a node's location
  relative to the scan root (used today only in the cart panel).
- A single **`useInput` keyboard dispatcher** and a single **render function** in `App.js`,
  both organized around one piece of state (`current` folder) and one row list
  (`sortedChildren(current)`).

### Key files

```
disk-reclaim/
├── src/
│   ├── index.js      CLI entry; runs scan(), then mounts <App root={tree}/>
│   ├── scan.js       recursive fs walk → node tree (the data source)
│   ├── App.js        ALL UI state, keyboard handling, and rendering
│   ├── rules.js      findMatches(root) — the existing whole-tree → flat-list walk
│   ├── reclaim.js    cart math + deletion + in-place tree size updates
│   └── format.js     humanSize / bar / relativePath display helpers
└── test/
    ├── scan.test.js
    ├── rules.test.js  (pattern for testing a whole-tree traversal)
    ├── reclaim.test.js
    └── format.test.js
```

### How data flows today

```
index.js
  scan(target) ──────────────► root node (whole tree in memory)
                                  │
                                  ▼
                          render(<App root={root} />)
                                  │
   App.js state: current, cursor, marked(Map path→node), mode, history
                                  │
        rows = sortedChildren(current)   ◄── ONLY ever the direct children
                                  │             of the current folder
                                  ▼
        viewport windowFor(cursor,…) → visible rows → Ink <Text> lines
```

The node tree is walked in full exactly once at startup, and again in full only when the
user presses `r` (rules). Everything else operates on `current.children`.

## Detailed Findings

### 1. The data source: the scanned node tree (`scan.js`)

`scan(dir, onProgress)` (src/scan.js:17-22) resolves the target to an absolute path and
recursively `walk`s it, returning the root node. Node shape (src/scan.js:25):

```js
{ name, path, isDir, size, children, parent, error }
```

Relevant invariants for a flat-files view:

- **Every file is already a node with an accurate `size`.** For non-directories,
  `node.size = stat.size` (src/scan.js:35-40). Directory sizes are summed bottom-up
  (src/scan.js:58). So a flat "largest files" traversal would read `size` on leaf nodes
  with no extra stat calls — the whole tree is already in memory.
- **`isDir` distinguishes files from folders** (src/scan.js:35, 42). A files-only view
  would filter on `!node.isDir`.
- **Symlinks are skipped entirely** (`entry.isSymbolicLink()` → `continue`,
  src/scan.js:54-55) and never appear as nodes. `lstat` is used, not `stat`
  (src/scan.js:29). This is a deliberate correctness/loop-safety invariant (see CLAUDE.md).
- **Unreadable entries carry an `error` code** instead of throwing (src/scan.js:30-33,
  47-51). Such nodes still exist in the tree; a file with an `error` would have `size: 0`.
- **`parent` back-pointers exist on every node** (src/scan.js:25, 56 via the `node`
  argument). These are what make `relativePath` display and `removeFromTree` ancestor
  updates work from any node regardless of how it was reached.

### 2. The existing whole-tree → flat-list precedent (`rules.js`)

`findMatches(root, rules)` (src/rules.js:23-35) is the single existing example of walking
the entire tree from the scan root and returning a **flat array of nodes**:

```js
export function findMatches(root, rules = RULES) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (rules.some((r) => r.match(node))) { out.push(node); return; } // stops descent
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}
```

Structurally this is the same shape a "collect all files" walk would take — a recursive
`visit` accumulating into `out`. The one behavioral difference relevant to note: this walk
**stops descending** once a node matches (src/rules.js:29), specifically to avoid nested
duplicates. A largest-files walk that wants leaf files would instead descend fully and push
leaves. The traversal skeleton, its recursion over `node.children`, and its return type
(flat `node[]`) are the reusable pattern.

`App.js` consumes it via `applyRules()` (src/App.js:51-69): it calls `findMatches(root)`
— note **`root`, not `current`** (src/App.js:52) — and merges results into the `marked`
Map. This is the existing precedent for a keyboard action that operates on the *whole tree*
rather than the current folder.

### 3. Sorting largest-first (`App.js`)

Sorting by size descending already exists in two places, both inline comparators:

- `sortedChildren(node)` (src/App.js:11-13): `[...node.children].sort((a, b) => b.size - a.size)`.
  Applied only to a single folder's direct children (src/App.js:32).
- The cart list: `topLevelMarked(marked).sort((a, b) => b.size - a.size)` (src/App.js:129).

There is no existing "top N" slicing of a size-sorted list *of the whole tree*; the closest
is the cart panel truncating its already-sorted list to `viewHeight` rows
(`markedList.slice(0, viewHeight)`, src/App.js:164) with an "…and N more" line
(src/App.js:170-172).

### 4. The view/render model (`App.js`)

The UI is a single component with one primary axis of state: **`current`** (the folder
being viewed) and **`cursor`** (row index within it). There is currently **no notion of
"which view/mode of browsing"** beyond `mode` (`browse | confirm | deleting`,
src/App.js:28), which governs deletion confirmation, not what list is shown.

Row list derivation (src/App.js:32):
```js
const rows = sortedChildren(current);
```
Everything downstream reads `rows`:

- Cursor clamping in `useInput` uses `rows.length` (src/App.js:113, 117).
- Navigation `enter(rows[cursor])` / mark `toggleMark(rows[cursor])` index into `rows`
  (src/App.js:114, 118).
- The viewport `windowFor(cursor, rows.length, viewHeight)` (src/App.js:126, 15-21) keeps
  the cursor centered and slices `rows.slice(start, end)` (src/App.js:127).
- Each visible row is rendered (src/App.js:142-155) with columns:
  cursor marker `▶`, mark check `✓`, `humanSize(size).padStart(9)`, a proportional `bar`
  with percentage, and a `child.isDir ? '/' : ' '` prefix + `child.name`.

Critically, the **percentage/bar is computed relative to `total = current.size`**
(src/App.js:33, 146): `const frac = child.size / total`. This "fraction of the current
folder" denominator is meaningful for per-folder browsing; a flat cross-tree list has no
single parent folder, so this denominator concept is folder-scoped as written.

Rows also display only `child.name` (the basename), not a path (src/App.js:153) — because
in folder view the location is implied by `current`. The **cart panel is the only place a
node's location is shown**, via `relativePath(root.path, n.path)` (src/App.js:167).

### 5. The marking / cart system (`App.js` + `reclaim.js`)

The cart is **view-independent** — this is the most reusable piece for any new view:

- State: `marked` is a `Map` keyed by `node.path` → node (src/App.js:27).
- `toggleMark(node)` (src/App.js:71-78) adds/removes by `node.path`. It takes *any node*,
  so a node surfaced by a flat view marks identically to one surfaced by folder view.
- `topLevelMarked(marked)` (src/reclaim.js:8-19) dedups overlapping marks by walking each
  node's `parent` chain — so if both a giant file and an ancestor folder are marked, only
  the ancestor counts. This uses `parent` pointers, which every node has regardless of the
  view that surfaced it.
- `reclaimableBytes` (src/reclaim.js:22-24) and the cart panel render (src/App.js:158-173)
  read from `marked` directly and are agnostic to how items got marked.
- Deletion (`performDelete`, src/App.js:80-96) operates on `topLevelMarked(marked)`,
  calls `deleteNodes` (src/reclaim.js:31-43, never throws), then `removeFromTree` for each
  deleted node (src/reclaim.js:49-55), which splices the node out and subtracts its size
  from every ancestor **in place** — so freed space is reflected without rescanning, from
  any node reachable via `parent`.

Implication documented (not a recommendation): a file deleted from a hypothetical flat
view would flow through the exact same `removeFromTree` path and correctly update its
ancestors' sizes, because the node retains its `parent` chain.

### 6. Keyboard input dispatch (`App.js`)

All keys are handled in one `useInput` callback (src/App.js:98-124). Current bindings:

| Key(s) | Action | Line |
|---|---|---|
| `q`, `Ctrl+C` | quit | 111 |
| `↑`/`k`, `↓`/`j` | move cursor (clamped to `rows.length`) | 112-113 |
| `→`/`Enter`/`l` | `enter(rows[cursor])` | 114 |
| `←`/`h`/`Backspace`/`Delete` | `goUp()` | 115 |
| `g` / `G` | cursor to top / bottom | 116-117 |
| `Space`/`m` | `toggleMark(rows[cursor])` | 118 |
| `r` | `applyRules()` (whole-tree) | 119 |
| `c` | clear marks | 120-122 |
| `d` | enter confirm mode | 123 |

The dispatcher early-returns in `deleting` mode (src/App.js:99) and branches entirely into
a separate handler in `confirm` mode (src/App.js:101-108). Free (unbound) letters that a
new view toggle could use are not enumerated here — this table is the current state.

`enter()` and `goUp()` (src/App.js:36-49) maintain a `history` Map (folder path → cursor
position, src/App.js:30) so returning to a folder restores its cursor. This history is
keyed by `current.path` and is specific to the folder-navigation model.

### 7. Display helpers (`format.js`)

All three helpers a flat list would render with already exist and are unit-tested:

- `humanSize(bytes)` (src/format.js:6-12) → e.g. `"1.5 KB"`.
- `bar(fraction, width=12)` (src/format.js:15-18) → `"[####      ]"`; clamps fraction to
  [0,1].
- `relativePath(rootPath, nodePath)` (src/format.js:21-24) → path relative to scan root,
  root itself → `"."`. **This is the existing mechanism for showing where a node lives**,
  exactly the "buried deep" location a flat files view would surface. Today it is only
  called for cart items (src/App.js:167).

### 8. Testing conventions (`test/`)

Tests use Node's built-in runner (`node:test` + `node:assert/strict`), no devDependencies,
one file per logic module. `test/rules.test.js` is the direct template for testing a
whole-tree traversal: it hand-builds node trees with a `node()` helper that wires `parent`
back-pointers (test/rules.test.js:6-11), then asserts on the flat array `findMatches`
returns (test/rules.test.js:13-51), including nesting/dedup and file-vs-dir cases. A new
traversal that collects files would be testable with the same harness. Per CLAUDE.md, the
`App.js` Ink UI is not currently unit-tested; logic in `scan/reclaim/format/rules` is.

## Code References

- `src/scan.js:17-22` — `scan()` entry; returns the whole in-memory tree.
- `src/scan.js:25` — node shape (`{ name, path, isDir, size, children, parent, error }`).
- `src/scan.js:35-40` — file nodes get `size = stat.size`; `isDir` stays false.
- `src/scan.js:54-55` — symlinks skipped (never nodes); invariant to preserve.
- `src/rules.js:23-35` — `findMatches(root)`: existing whole-tree → flat `node[]` walk.
- `src/App.js:11-13` — `sortedChildren`: largest-first sort (folder-scoped).
- `src/App.js:15-21` — `windowFor`: scrolling viewport slice logic.
- `src/App.js:32-33` — `rows = sortedChildren(current)`, `total = current.size` (bar denom).
- `src/App.js:51-69` — `applyRules`: precedent for a whole-tree keyboard action on `root`.
- `src/App.js:71-78` — `toggleMark`: view-independent marking by `node.path`.
- `src/App.js:98-124` — the single `useInput` keyboard dispatcher and all bindings.
- `src/App.js:126-155` — viewport windowing + per-row rendering (columns/colors).
- `src/App.js:158-173` — cart panel render, incl. `relativePath` + `slice(0, viewHeight)`.
- `src/reclaim.js:8-19` — `topLevelMarked`: parent-chain dedup of overlapping marks.
- `src/reclaim.js:49-55` — `removeFromTree`: in-place size updates via `parent` chain.
- `src/format.js:21-24` — `relativePath`: node location relative to scan root.
- `test/rules.test.js:6-51` — template for testing a whole-tree traversal.

## Architecture Documentation

Patterns and conventions currently in force:

- **Scan once, operate in memory.** The tree is built a single time at startup
  (`index.js` → `scan`). No code re-reads the filesystem to answer questions about sizes;
  it reads the cached node graph. `removeFromTree` keeps the graph consistent after deletes
  without rescanning.
- **Whole-tree operations start from `root`, folder operations from `current`.** `applyRules`
  passes `root` (src/App.js:52); browsing derives `rows` from `current` (src/App.js:32).
  These are the two established scopes.
- **Flat node lists are produced by a recursive `visit`/accumulate walk** returning
  `node[]` (`findMatches`), and consumed by merging nodes into the `marked` Map by `path`.
- **The cart is the shared sink.** Any feature that identifies nodes (manual marking, rules)
  funnels into the same `marked` Map, and deletion/dedup/size-accounting are all downstream
  of that Map — independent of how nodes were discovered.
- **Display is column-oriented** via `humanSize` / `bar` / `relativePath`, with location
  shown through `relativePath(root.path, …)` and basename via `node.name`.
- **Rendering is a single component** with one row list; the viewport (`windowFor`) and the
  per-row `<Text>` template (src/App.js:142-155) are the two rendering primitives.

## Open Questions

These are aspects the codebase does **not** currently address (stated as facts about the
present code, not as design proposals):

- There is currently **no second browsing mode/view**; `mode` only distinguishes
  `browse/confirm/deleting`, and the visible list is always `sortedChildren(current)`. The
  code has no existing switch for "show a different list."
- The per-row **percentage/bar denominator is folder-scoped** (`current.size`,
  src/App.js:146); there is no existing "fraction of total tree" denominator.
- Rows in the main list currently show **basename only** (src/App.js:153); full/relative
  path display exists only in the cart panel.
- `findMatches` **stops descent at a match** (src/rules.js:29); the codebase has no existing
  walk that descends fully to collect every leaf file.
- The **`App.js` UI has no unit tests** (per CLAUDE.md); only logic modules are tested.
</content>
</invoke>
