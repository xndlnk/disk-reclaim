---
date: 2026-07-07T18:12:27+00:00
git_commit: 53a01e454dddcf8fde42390a64351255b5e28e43
branch: refactor/app-readability
topic: "File/directory age column"
tags: [plan, scan, format, BrowseView, App]
status: draft
---

# PLAN: File/directory age column

Add an at-a-glance "age" annotation to every row in the browse UI, showing when a
file (or anything inside a directory) was **last changed**. The column must be tiny
and quiet: files changed within the last 24h are treated as "current" and show
nothing at all; older items show a single compact token (`3d`, `2w`, `8mo`, `2y`).
The goal is to help answer *"is it safe to reclaim this?"* — a subtree nothing has
touched in a year is a good deletion candidate.

## Acceptance Criteria

- Every scanned node carries an `mtime` (milliseconds). A file's `mtime` is its own
  `lstat` mtime; a directory's `mtime` is the **max mtime of its whole subtree**,
  with the directory's own mtime as a floor.
- A pure `formatAge(mtimeMs, nowMs)` returns `""` for anything under 24h, otherwise
  a single largest-unit token: `"3d"`, `"2w"`, `"8mo"`, `"2y"` (≤ 4 chars).
- Each main-list row — in **both** the tree and largest views — shows the age as a
  fixed 4-wide, **dim** column immediately before the name. Items under 24h render a
  blank column and column alignment is preserved.
- `now` is captured once per render in `App.js` and passed down, so all rows share a
  single time reference and `formatAge` stays pure.
- Error/unreadable nodes never crash aggregation; a missing/unknown mtime is `0`,
  which renders as a blank column.
- No change to sort order, filtering, keybindings, the header, or the reclaim cart.

## Technical Key Decisions and Tradeoffs

1. **Directory age = max mtime of its subtree.**
   - Why: answers "is anything in here still in use?" — the reclaim question. A cache
     untouched for a year reads as `1y`; edit one deep file and the folder reads current.
   - Impact: aggregate `mtime` bottom-up in `scan.js` alongside `size`, at no extra
     syscall cost (the `lstat` that yields `size` also yields `mtimeMs`).

2. **Age is mtime-based, single-unit, blank under 24h.**
   - Why: matches "recently changed = current"; keeps the column tiny and quiet.
   - Impact: a new pure `formatAge(mtimeMs, nowMs)` in `format.js`, fully unit-tested.

3. **Fixed 4-wide dim column before the name; display-only.**
   - Why: a column *before* the name never truncates (the name is the variable field
     that truncates on narrow terminals); dim keeps the row calm; no scope creep.
   - Impact: one edit to the shared row in `BrowseView.js`; thread `now` from `App.js`.
     No new sort/filter/keybinding.

## Current State

```
scan.js  ──►  node = { name, path, isDir, size, children, parent, error }
              lstat runs on every node (scan.js:30) → mtimeMs available but discarded.
              size is aggregated bottom-up (scan.js:63).
                │
                ▼
App.js   ──►  owns state; derives `rows` (sortedChildren | largestFiles);
              passes them to ─┐
                              ▼
BrowseView.js ──►  one truncating <Text> per row, shared by tree + largest views:

    ▶✓    1.2 GB [########    ]  87%  /node_modules
    │└ marked           bar     pct   name (relative path in largest view)
    └ cursor
        └ size (padStart 9)

format.js     ──►  humanSize / bar / barColor / relativePath (pure, unit-tested)
```

No time information is captured or shown anywhere today.

## Desired End State

```
scan.js  ──►  node = { ..., size, mtime }        ← mtime added, aggregated bottom-up
                │
                ▼
App.js   ──►  const now = Date.now()  (once per render)  ─── now ──►
                              ▼
BrowseView.js ──►  row gains a fixed 4-wide dim age column before the name:

    ▶✓    1.2 GB [########    ]  87%   8mo  /node_modules
    ▶✓  340.0 MB [##          ]  12%        /src           ← <24h → blank, aligned
    ▶✓   12.0 MB [            ]   1%   2y   /old-logs

format.js     ──►  + formatAge(mtimeMs, nowMs)   (pure, unit-tested)
```

## Abstractions and Code Reuse

- **`mtime` mirrors `size`**: both are numeric node fields aggregated bottom-up in the
  same `walk` loop. No new traversal, no new syscall.
- **`formatAge` mirrors `humanSize`**: a small pure formatter in `format.js`, tested
  the same way. Takes `now` as an argument so it has no hidden clock dependency.
- **`now` mirrors the existing render-derived values** (`rows`, `total`, `viewHeight`)
  computed in `App.js` and passed into `BrowseView` as a prop.

File tree of changes:

- `src`
  - `scan.js` — capture and bottom-up aggregate `mtime`
    - `walk` — set `node.mtime` from `stat.mtimeMs`; for dirs, `Math.max` over children
  - `format.js` — add the age formatter
    - `formatAge(mtimeMs, nowMs)` — `""` under 24h, else `Nd`/`Nw`/`Nmo`/`Ny`
  - `App.js` — provide the time reference
    - `App` — `const now = Date.now()`; pass `now` to `BrowseView`
  - `BrowseView.js` — render the age column
    - `BrowseView` — accept `now` prop; insert dim `formatAge(child.mtime, now).padStart(4)` before the name
- `test`
  - `scan.test.js` — assert directory `mtime` = max descendant mtime
  - `format.test.js` — assert `formatAge` buckets and boundaries
  - `BrowseView.test.js` — assert the age token renders (and is blank under 24h)

## Logging & Observability

None. This is a purely presentational annotation with no logging surface.

## Implementation

### Phase 1: Capture mtime + age formatter (internal)

Dependencies: None

Add the data and the pure formatter, fully covered by unit tests, with no UI change yet.

**Tasks**:
- [x] In `src/scan.js`, add `mtime: 0` to the initial `node` literal (scan.js:26).
- [x] In `src/scan.js`, set the file mtime on the non-directory branch:
  `node.mtime = stat.mtimeMs` next to `node.size = stat.size` (scan.js:37).
- [x] In `src/scan.js`, seed the directory mtime from its own stat as a floor
  (`node.mtime = stat.mtimeMs`) before reading entries, and raise it per child in the
  walk loop: `node.mtime = Math.max(node.mtime, child.mtime)` alongside the existing
  `node.size += child.size` (scan.js:63). Error paths leave `mtime` at its current
  value (own dir mtime, or `0` when `lstat` itself failed) and never throw.
- [x] In `src/format.js`, add `formatAge(mtimeMs, nowMs)`:
  ```js
  const DAY = 86_400_000;
  export function formatAge(mtimeMs, nowMs) {
    const diff = nowMs - mtimeMs;
    if (!mtimeMs || diff < DAY) return '';        // <24h or unknown → "current"
    if (diff < 7 * DAY)   return `${Math.floor(diff / DAY)}d`;
    if (diff < 30 * DAY)  return `${Math.floor(diff / (7 * DAY))}w`;
    if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))}mo`;
    return `${Math.floor(diff / (365 * DAY))}y`;
  }
  ```
- [x] In `test/scan.test.js`, add a test: create files, backdate them with `fs.utimes`,
  and assert a directory's `mtime` equals the max mtime of its descendants (and that a
  recently-written sibling raises the parent's mtime). Follow the existing `mkdtemp`
  fixture pattern.
- [x] In `test/format.test.js`, add tests for `formatAge` using a fixed `now` and
  `mtime = now - diff`: `<24h → ""`, `3*DAY → "3d"`, boundary `7*DAY → "1w"`,
  `30*DAY → "1mo"`, `365*DAY → "1y"`, and `mtimeMs = 0 → ""`.

**Automated Verification**:
- [x] `node --test --test-name-pattern=formatAge` passes.
- [x] `node --test --test-name-pattern=scan` passes (existing size/symlink/error tests
  still green, new mtime-aggregation test green).
- [x] `npm test` passes.

### Phase 2: Render the age column (user-facing)

Dependencies: Phase 1

Thread a single `now` reference from `App.js` and render the dim age column in the
shared row for both views.

**Tasks**:
- [x] In `src/App.js`, capture `const now = Date.now();` in the render body (near
  `rows`/`total`/`viewHeight`, App.js:37-39) and pass `now=${now}` in the
  `BrowseView` element (App.js:199-210).
- [x] In `src/BrowseView.js`, add `now` to the destructured props and `import
  { humanSize, bar, barColor, relativePath, formatAge } from './format.js'`.
- [x] In `src/BrowseView.js`, insert the age column between the pct `<Text>` and the
  name section (BrowseView.js:68-71), as its own dim, fixed-width token so alignment
  holds for blank (<24h) rows:
  ```js
  <${Text} dimColor=${true}>${formatAge(child.mtime, now).padStart(4)}</${Text}>${' '}
  ```
- [x] In `test/BrowseView.test.js`, extend the `file`/`dir` fixtures or pass `mtime`
  via the existing `extra` object, provide a `now` in the `render` base props, and add
  a test: an old file (`mtime = now - 400*DAY`) shows `1y` on its row while a recent
  file (`mtime = now - 1000`) shows no age token — with both rows still aligned.

**Automated Verification**:
- [x] `node --test --test-name-pattern=BrowseView` passes.
- [x] `npm test` passes.

**Manual Verification**:
- [x] `node src/index.js .` — the browse list shows a small dim age token before names
  for older items and nothing for items changed in the last day; toggle the largest
  view with `l` and confirm the same column appears there. Columns stay aligned on a
  narrow terminal.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `src/scan.js:26-66` — node shape and bottom-up `size` aggregation (mtime mirrors it)
- `src/format.js:6-12` — `humanSize`, the model for `formatAge`
- `src/BrowseView.js:64-72` — the shared row this feature extends
- `src/App.js:35-39,199-210` — render-derived props passed to `BrowseView`
- `test/BrowseView.test.js:13-42` — `file`/`dir` fixtures and `renderToText` helper
