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
 */
export async function deleteNodes(nodes) {
  const deleted = [];
  const failed = [];
  for (const node of nodes) {
    try {
      await fs.rm(node.path, { recursive: true, force: true });
      deleted.push(node);
    } catch (err) {
      failed.push({ node, error: err.code || err.message });
    }
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
