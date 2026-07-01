import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { scan } from '../src/scan.js';
import { deleteNodes } from '../src/reclaim.js';

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

  const nodes = [{ path: dir }, { path: file }];
  const { deleted, failed } = await deleteNodes(nodes);

  assert.equal(deleted.length, 2);
  assert.equal(failed.length, 0);
  await assert.rejects(fs.stat(dir)); // recursively removed
  await assert.rejects(fs.stat(file));
  // Note: the failure path isn't exercised here — fs.rm uses { force: true },
  // so provoking a real failure is platform-dependent and left uncovered.
});
