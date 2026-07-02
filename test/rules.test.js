import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findMatches, RULES } from '../src/rules.js';

/** Build a node in the shape scan.js produces, wiring parent back-pointers. */
function node(name, { isDir = false, children = [] } = {}) {
  const n = { name, path: name, isDir: isDir || children.length > 0, size: 0, children, parent: null };
  for (const child of children) child.parent = n;
  return n;
}

test('findMatches: finds a node_modules folder nested a few levels deep', () => {
  const nm = node('node_modules', { isDir: true });
  const tree = node('root', {
    children: [node('src', { children: [node('pkg', { children: [nm] })] })],
  });
  assert.deepEqual(findMatches(tree), [nm]);
});

test('findMatches: does not descend into a matched folder (nested dedup)', () => {
  const inner = node('node_modules', { isDir: true });
  const outer = node('node_modules', { children: [node('dep', { children: [inner] })] });
  const tree = node('root', { children: [outer] });
  const result = findMatches(tree);
  assert.equal(result.length, 1);
  assert.equal(result[0], outer); // only the top-level match, inner never visited
});

test('findMatches: scopes to the passed node, ignoring matches elsewhere in the tree', () => {
  const outside = node('node_modules', { isDir: true });
  const inside = node('node_modules', { isDir: true });
  const sub = node('sub', { children: [inside] });
  const tree = node('root', { children: [outside, sub] });
  // Scanning from `sub` must find only the match within it — this is what lets
  // `App` apply rules from the folder the user has navigated into.
  assert.deepEqual(findMatches(sub), [inside]);
});

test('findMatches: matches the other curated folder names', () => {
  const dist = node('dist', { isDir: true });
  const next = node('.next', { isDir: true });
  const target = node('target', { isDir: true });
  const tree = node('root', {
    children: [dist, node('app', { children: [next] }), target],
  });
  const result = findMatches(tree);
  assert.equal(result.length, 3);
  for (const m of [dist, next, target]) assert.ok(result.includes(m));
});

test('findMatches: ignores a file that shares a rule name', () => {
  const buildFile = node('build'); // not a dir
  const tree = node('root', { children: [buildFile] });
  assert.deepEqual(findMatches(tree), []);
});

test('findMatches: returns [] when nothing matches', () => {
  const tree = node('root', { children: [node('src', { children: [node('index.js')] })] });
  assert.deepEqual(findMatches(tree), []);
});

test('RULES: every rule exposes id, label, and a match function', () => {
  for (const rule of RULES) {
    assert.equal(typeof rule.id, 'string');
    assert.equal(typeof rule.label, 'string');
    assert.equal(typeof rule.match, 'function');
  }
});

test('RULES: every rule has a non-empty desc for the help page', () => {
  for (const rule of RULES) {
    assert.equal(typeof rule.desc, 'string', `${rule.id} is missing a desc`);
    assert.ok(rule.desc.length > 0, `${rule.id} has an empty desc`);
  }
});
