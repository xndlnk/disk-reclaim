/**
 * Whole-tree "largest files" walk. Mirrors rules.js `findMatches`, but descends
 * fully and collects only leaf file nodes so a single giant file buried deep in
 * the tree is visible without hunting folder by folder.
 *
 * Symlinks never appear (scan.js omits them); error/zero-size files sort to the
 * bottom naturally and are not specially filtered.
 */

/** Collect leaf file nodes anywhere under `root`, sorted largest-first, capped at `n`. */
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

/** Total number of leaf files in the tree (for the header "(of N files)" note). */
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
