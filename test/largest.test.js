import { test } from 'node:test';
import assert from 'node:assert/strict';

import { largestFiles, countFiles } from '../src/largest.js';

/** Build a node in the shape scan.js produces, wiring parent back-pointers.
 *  Extends the rules.test.js helper with a `size` option so sort order is testable. */
function node(name, { isDir = false, size = 0, children = [] } = {}) {
  const n = { name, path: name, isDir: isDir || children.length > 0, size, children, parent: null };
  for (const child of children) child.parent = n;
  return n;
}

test('largestFiles: collects files from several levels deep, sorted largest-first', () => {
  const tree = node('root', {
    children: [
      node('small.txt', { size: 10 }),
      node('sub', {
        children: [
          node('big.bin', { size: 1000 }),
          node('deep', { children: [node('mid.log', { size: 500 })] }),
        ],
      }),
    ],
  });
  const result = largestFiles(tree);
  assert.deepEqual(result.map((f) => f.name), ['big.bin', 'mid.log', 'small.txt']);
});

test('largestFiles: excludes directories (only leaf files returned)', () => {
  const tree = node('root', {
    children: [
      node('emptydir', { isDir: true }),
      node('file.txt', { size: 5 }),
      node('sub', { children: [node('nested.txt', { size: 3 })] }),
    ],
  });
  const result = largestFiles(tree);
  assert.equal(result.length, 2);
  for (const f of result) assert.equal(f.isDir, false);
  assert.deepEqual(result.map((f) => f.name), ['file.txt', 'nested.txt']);
});

test('largestFiles: respects the n cap', () => {
  const tree = node('root', {
    children: [
      node('a', { size: 5 }),
      node('b', { size: 4 }),
      node('c', { size: 3 }),
      node('d', { size: 2 }),
      node('e', { size: 1 }),
    ],
  });
  const result = largestFiles(tree, 3);
  assert.deepEqual(result.map((f) => f.name), ['a', 'b', 'c']);
});

test('largestFiles: returns [] for a tree with no files (only empty dirs)', () => {
  const tree = node('root', {
    children: [node('a', { isDir: true }), node('b', { children: [node('c', { isDir: true })] })],
  });
  assert.deepEqual(largestFiles(tree), []);
});

test('largestFiles: defaults to n = 50 when called with a single argument', () => {
  const children = [];
  for (let i = 0; i < 60; i += 1) children.push(node(`f${i}`, { size: i }));
  const tree = node('root', { children });
  assert.equal(largestFiles(tree).length, 50);
});

test('largestFiles: a root that is itself a single file returns [thatFile]', () => {
  const file = node('solo.bin', { size: 42 });
  assert.deepEqual(largestFiles(file), [file]);
});

test('countFiles: returns the total leaf-file count (nested)', () => {
  const tree = node('root', {
    children: [
      node('a.txt', { size: 1 }),
      node('sub', { children: [node('b.txt', { size: 1 }), node('c.txt', { size: 1 })] }),
    ],
  });
  assert.equal(countFiles(tree), 3);
});

test('countFiles: returns 0 for a dir-only tree', () => {
  const tree = node('root', {
    children: [node('a', { isDir: true }), node('b', { children: [node('c', { isDir: true })] })],
  });
  assert.equal(countFiles(tree), 0);
});
