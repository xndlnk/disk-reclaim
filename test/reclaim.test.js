import { test } from 'node:test';
import assert from 'node:assert/strict';

import { topLevelMarked, reclaimableBytes, removeFromTree } from '../src/core/reclaim.js';

/**
 * Build a node in the same shape scan.js produces, wiring up the parent
 * back-pointer that topLevelMarked/removeFromTree rely on.
 */
function node(name, size, children = []) {
  const n = { name, path: name, isDir: children.length > 0, size, children, parent: null };
  for (const child of children) child.parent = n;
  return n;
}

/** A Map<path, node>, matching App.js's `marked` state. */
function marks(...nodes) {
  return new Map(nodes.map((n) => [n.path, n]));
}

test('topLevelMarked: drops a marked node nested inside another marked node', () => {
  const inner = node('inner.txt', 10);
  const folder = node('folder', 10, [inner]);
  const result = topLevelMarked(marks(folder, inner));
  assert.deepEqual(result, [folder]);
});

test('topLevelMarked: keeps two independent marked siblings', () => {
  const a = node('a', 5);
  const b = node('b', 5);
  node('root', 10, [a, b]); // wires parents; root itself is unmarked
  const result = topLevelMarked(marks(a, b));
  assert.equal(result.length, 2);
  assert.ok(result.includes(a) && result.includes(b));
});

test('topLevelMarked: keeps a marked child whose ancestors are unmarked', () => {
  const child = node('child.txt', 7);
  node('root', 7, [child]);
  assert.deepEqual(topLevelMarked(marks(child)), [child]);
});

test('reclaimableBytes: counts only top-level nodes (no double count)', () => {
  const inner = node('inner.txt', 30);
  const folder = node('folder', 30, [inner]);
  assert.equal(reclaimableBytes(marks(folder, inner)), 30);
});

test('reclaimableBytes: sums independent marks', () => {
  const a = node('a', 100);
  const b = node('b', 250);
  node('root', 350, [a, b]);
  assert.equal(reclaimableBytes(marks(a, b)), 350);
});

test('removeFromTree: splices the node and subtracts size from all ancestors', () => {
  const target = node('big.bin', 40);
  const sub = node('sub', 40, [target]);
  const keep = node('keep.txt', 10);
  const root = node('root', 50, [sub, keep]);

  removeFromTree(target);

  assert.equal(sub.children.includes(target), false);
  assert.equal(sub.size, 0);
  assert.equal(root.size, 10); // 50 - 40
  assert.ok(root.children.includes(keep)); // siblings untouched
});

test('removeFromTree: is a no-op for a root node with no parent', () => {
  const root = node('root', 5);
  assert.doesNotThrow(() => removeFromTree(root));
  assert.equal(root.size, 5);
});
