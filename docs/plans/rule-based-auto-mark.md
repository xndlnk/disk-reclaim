# Plan: Rule-based auto-mark of reclaimable folders

> Status: implemented. Kept for reference.

## Context

The user wanted to bulk-add well-known regenerable directories (starting with `node_modules`) to the reclaim cart via fixed rules, instead of hunting for and marking them by hand. Decisions confirmed: the search walks the **entire scanned tree** from the root, and the first version ships a **curated set** of build-artifact folder rules. The design keeps a pure, testable rule engine (continuing the recent "backpressure" testing theme) and reuses the existing `marked` Map / `topLevelMarked` machinery so nested matches dedup for free.

## Action

Add a `src/rules.js` engine, wire a new keybinding into `App.js`, add tests, and update docs. The curated rules match directories by name: **node_modules, dist, build, .next, target, __pycache__, .gradle**.

### 1. `src/rules.js` (new)

Extensible rule registry plus a tree walker:

```js
// Each rule: { id, label, match(node) -> boolean }. Add a rule by pushing here.
export const RULES = [
  { id: 'node_modules', label: 'node_modules', match: (n) => n.isDir && n.name === 'node_modules' },
  { id: 'dist',         label: 'dist',         match: (n) => n.isDir && n.name === 'dist' },
  { id: 'build',        label: 'build',        match: (n) => n.isDir && n.name === 'build' },
  { id: 'next',         label: '.next',        match: (n) => n.isDir && n.name === '.next' },
  { id: 'target',       label: 'target',       match: (n) => n.isDir && n.name === 'target' },
  { id: 'pycache',      label: '__pycache__',  match: (n) => n.isDir && n.name === '__pycache__' },
  { id: 'gradle',       label: '.gradle',      match: (n) => n.isDir && n.name === '.gradle' },
];

// Walk from root; collect nodes matched by any rule. When a dir matches we do
// NOT descend into it — its contents are already covered, and this prevents
// nested duplicates (e.g. node_modules inside node_modules).
export function findMatches(root, rules = RULES) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (rules.some((r) => r.match(node))) { out.push(node); return; }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}
```

Rules match on `node.isDir` so a *file* named `build`/`dist` is ignored.

### 2. `src/App.js` — wire it in

- Import `findMatches` from `./rules.js`.
- Add an `applyRules` handler that merges matches into `marked` without clobbering existing marks, then reports the count and new cart total in the status line.
- Add a browse-mode keybinding: `else if (input === 'r') applyRules();` (`r` was unused).
- Add `r rules` to the footer hint string.

### 3. `test/rules.test.js` (new)

Reuse the in-memory `node()` tree helper pattern from `test/reclaim.test.js`:

- `findMatches` finds a `node_modules` folder nested a few levels deep.
- Nested match dedup: a `node_modules` inside a matched `node_modules` is NOT returned separately (walker stops descending) — result length is 1.
- Matches other curated names (`dist`, `.next`, `target`, etc.); multiple independent matches all returned.
- A *file* named `build` is ignored (rules require `isDir`).
- Empty tree / no matches returns `[]`.
- Every `RULES` entry exposes `id`, `label`, and a `match` function.

### 4. Docs

- `CLAUDE.md`: add `rules.js` to the architecture list and `r` to the key-bindings line.
- `README.md`: add the `r` key row, an "Auto-marking with rules" section, and the module reference.

## Files

- `src/rules.js` (new), `test/rules.test.js` (new)
- `src/App.js`
- `CLAUDE.md`, `README.md`

## Verification

- `npm test` — new `rules.test.js` plus existing suites all pass.
- Manual: run `node src/index.js <a dir containing node_modules>`, press `r`, confirm matched folders appear in the reclaim cart with the correct total, and that pressing `d` then `y` deletes them (sizes update in place via the existing `removeFromTree` path).
- `node --test --test-name-pattern=findMatches` to run just the rule tests.
