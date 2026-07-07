import fs from 'node:fs/promises';

/**
 * From a set of marked nodes, keep only the "top level" ones — drop any node
 * that lives inside another marked node. Deleting a folder already removes its
 * contents, so this prevents double-counting sizes and redundant deletes.
 */
export function topLevelMarked(markedMap) {
  const nodes = [...markedMap.values()];
  const set = new Set(nodes);
  return nodes.filter((n) => {
    let p = n.parent;
    while (p) {
      if (set.has(p)) return false;
      p = p.parent;
    }
    return true;
  });
}

/** Sum of reclaimable bytes, counting each top-level marked node once. */
export function reclaimableBytes(markedMap) {
  return topLevelMarked(markedMap).reduce((sum, n) => sum + n.size, 0);
}

/**
 * Delete each node from disk. Folders are removed recursively.
 * Returns { deleted: node[], failed: {node, error}[] } — we never throw so a
 * single permission error doesn't abort the whole batch.
 *
 * `onProgress({ done, total, freed })` is called after each item so the caller
 * can render a progress bar. Granularity is per cart item (a whole folder counts
 * as one step); `done` counts attempts (successes and failures) and `freed` is
 * the bytes reclaimed so far.
 */
export async function deleteNodes(nodes, onProgress) {
  const deleted = [];
  const failed = [];
  const total = nodes.length;
  let freed = 0;
  onProgress?.({ done: 0, total, freed }); // seed with the real total up front
  for (const node of nodes) {
    try {
      await fs.rm(node.path, { recursive: true, force: true });
      deleted.push(node);
      freed += node.size || 0;
    } catch (err) {
      failed.push({ node, error: err.code || err.message });
    }
    onProgress?.({ done: deleted.length + failed.length, total, freed });
  }
  return { deleted, failed };
}

/**
 * Remove a node from the in-memory tree and subtract its size from every
 * ancestor, so the UI reflects reclaimed space without a full re-scan.
 */
export function removeFromTree(node) {
  const parent = node.parent;
  if (!parent) return;
  const idx = parent.children.indexOf(node);
  if (idx >= 0) parent.children.splice(idx, 1);
  for (let p = parent; p; p = p.parent) p.size -= node.size;
}
