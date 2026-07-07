import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { scan } from '../src/core/scan.js';
import { deleteNodes } from '../src/core/reclaim.js';

let tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'disk-reclaim-'));
});

after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test('scan: builds a tree with bottom-up directory sizes', async () => {
  const root = path.join(tmp, 'fixture');
  await fs.mkdir(path.join(root, 'sub'), { recursive: true });
  await fs.writeFile(path.join(root, 'a.txt'), 'aaaa'); // 4 bytes
  await fs.writeFile(path.join(root, 'b.txt'), 'bb'); // 2 bytes
  await fs.writeFile(path.join(root, 'sub', 'c.txt'), 'cccccc'); // 6 bytes

  const tree = await scan(root);

  assert.equal(tree.isDir, true);
  assert.equal(tree.error, null);
  assert.equal(tree.children.length, 3); // a.txt, b.txt, sub

  const sub = tree.children.find((c) => c.name === 'sub');
  assert.equal(sub.isDir, true);
  assert.equal(sub.size, 6);

  // Root size is the sum of every descendant, computed bottom-up.
  assert.equal(tree.size, 4 + 2 + 6);
});

test('scan: a directory mtime is the max mtime of its whole subtree', async () => {
  const root = path.join(tmp, 'mtimefix');
  await fs.mkdir(path.join(root, 'sub'), { recursive: true });
  const old = path.join(root, 'sub', 'old.txt');
  const fresh = path.join(root, 'fresh.txt');
  await fs.writeFile(old, 'x');
  await fs.writeFile(fresh, 'y');

  // Backdate both, then bump the sibling so it's the newest descendant.
  const longAgo = new Date('2020-01-01T00:00:00Z');
  const recent = new Date('2024-06-01T00:00:00Z');
  await fs.utimes(old, longAgo, longAgo);
  await fs.utimes(fresh, recent, recent);
  await fs.utimes(path.join(root, 'sub'), longAgo, longAgo);
  await fs.utimes(root, longAgo, longAgo); // dir's own mtime floor, below the fresh sibling

  const tree = await scan(root);

  const sub = tree.children.find((c) => c.name === 'sub');
  // sub's mtime is its single old descendant.
  assert.equal(sub.mtime, longAgo.getTime());
  // The root rolls up to the newest descendant (the fresh sibling), not the old one.
  assert.equal(tree.mtime, recent.getTime());
});

test('scan: never follows symlinks into the child tree', async () => {
  const root = path.join(tmp, 'symfix');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'real.txt'), 'x');
  await fs.symlink(path.join(root, 'real.txt'), path.join(root, 'link.txt'));

  const tree = await scan(root);

  const names = tree.children.map((c) => c.name);
  assert.ok(names.includes('real.txt'));
  assert.equal(names.includes('link.txt'), false); // symlink skipped entirely
});

test('scan: records an error instead of throwing on a missing path', async () => {
  const tree = await scan(path.join(tmp, 'does-not-exist'));
  assert.ok(tree.error, 'expected an error code on the node');
  assert.equal(tree.isDir, false);
});

test('deleteNodes: removes real files and dirs from disk', async () => {
  const root = path.join(tmp, 'delfix');
  const dir = path.join(root, 'folder');
  const file = path.join(root, 'loose.txt');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'nested.txt'), 'data');
  await fs.writeFile(file, 'data');

  const nodes = [{ path: dir, size: 4 }, { path: file, size: 4 }];
  const updates = [];
  const { deleted, failed } = await deleteNodes(nodes, (p) => updates.push(p));

  assert.equal(deleted.length, 2);
  assert.equal(failed.length, 0);
  await assert.rejects(fs.stat(dir)); // recursively removed
  await assert.rejects(fs.stat(file));

  // Progress is reported per cart item: total is the item count and the final
  // update lands at done === total with the full byte count freed.
  const last = updates.at(-1);
  assert.equal(last.total, 2);
  assert.equal(last.done, 2);
  assert.equal(last.freed, 8);
  // Note: the failure path isn't exercised here — fs.rm uses { force: true },
  // so provoking a real failure is platform-dependent and left uncovered.
});
