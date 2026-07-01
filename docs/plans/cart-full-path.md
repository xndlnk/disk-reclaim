# Plan: Show full (relative) path for reclaim-cart items

> Status: planned. Kept for reference.

## Context

The reclaim cart on the right rendered only each marked node's `name` (`src/App.js`), so two `node_modules` folders nested under different parents showed as identical `node_modules` rows — indistinguishable. The fix: show each cart item's path **relative to the scanned root** (the tree root shown in the header), e.g. `app/node_modules/` vs `api/node_modules/`. Reference point (confirmed with the user) is the explored/scanned root (`root.path`), not `process.cwd()` — these are identical when launched with no path argument.

The browse list is unchanged — this only affects the cart.

## Action

### 1. `src/format.js` — add a testable path helper

```js
import path from 'node:path';

/** A node's path relative to the scanned root, for display. Root itself -> ".". */
export function relativePath(rootPath, nodePath) {
  const rel = path.relative(rootPath, nodePath);
  return rel === '' ? '.' : rel;
}
```

### 2. `src/App.js` — render the relative path in the cart

- Extend the import: `import { humanSize, bar, relativePath } from './format.js';`
- In the cart item map, replace `${n.isDir ? '/' : ''}${n.name}` with the relative path plus a trailing slash for dirs, and switch the wrap mode to `truncate-middle` so both the leading folder and the trailing name stay visible when the `width=36` box truncates:

  ```js
  (n) => html`
    <${Text} key=${n.path} wrap="truncate-middle">
      <${Text} color="gray">${humanSize(n.size).padStart(9)}</${Text}> ${relativePath(root.path, n.path)}${n.isDir ? '/' : ''}
    </${Text}>`
  ```

  `root` is already in scope (the `App({ root })` prop).

### 3. `test/format.test.js` — cover `relativePath`

- Nested node → `'app/node_modules'`.
- Direct child → `'dist'`.
- Root itself → `'.'`.

### 4. Docs

- `CLAUDE.md`: note `relativePath` in the `format.js` architecture bullet.
- `README.md`: one line in "Reclaiming space" noting the cart shows each item's path relative to the scanned root.

## Files

- `src/format.js`, `src/App.js`
- `test/format.test.js`
- `CLAUDE.md`, `README.md`

## Verification

- `npm test` — new `relativePath` cases plus existing suites pass.
- Manual: run `node src/index.js <dir with node_modules nested under two different subfolders>`, press `r`, and confirm the cart shows distinct relative paths instead of two identical `node_modules` rows.
