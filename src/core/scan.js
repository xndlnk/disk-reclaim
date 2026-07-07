import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Recursively scan a directory and build a size tree.
 *
 * Each node: { name, path, isDir, size, children, parent, error }
 *   - size for a directory is the sum of all descendants (bottom-up).
 *   - children is sorted lazily by the UI, not here.
 *
 * We use lstat (not stat) so symlinks are counted as their own tiny size
 * and never followed — this avoids double-counting and infinite loops.
 *
 * `onProgress({ files, bytes, dir })` is called with the running file count,
 * bytes seen so far, and the directory currently being entered, so the UI can
 * show a live counter (and where the walk is) for a large tree.
 */
export async function scan(dir, onProgress) {
  const counter = { files: 0, bytes: 0, dir: '' };
  const absolute = path.resolve(dir);
  const root = await walk(absolute, path.basename(absolute) || absolute, null, counter, onProgress);
  return root;
}

async function walk(nodePath, name, parent, counter, onProgress) {
  const node = { name, path: nodePath, isDir: false, size: 0, mtime: 0, children: [], parent, error: null };

  let stat;
  try {
    stat = await fs.lstat(nodePath);
  } catch (err) {
    node.error = err.code || 'ESTAT';
    return node;
  }

  if (!stat.isDirectory()) {
    node.size = stat.size;
    node.mtime = stat.mtimeMs;
    counter.files += 1;
    counter.bytes += stat.size;
    if (onProgress && counter.files % 500 === 0)
      onProgress({ files: counter.files, bytes: counter.bytes, dir: counter.dir });
    return node;
  }

  node.isDir = true;
  node.mtime = stat.mtimeMs; // floor: the dir's own mtime, raised per child below
  counter.dir = nodePath;
  if (onProgress) onProgress({ files: counter.files, bytes: counter.bytes, dir: nodePath });

  let entries;
  try {
    entries = await fs.readdir(nodePath, { withFileTypes: true });
  } catch (err) {
    // Permission denied, etc. — keep the folder but mark it unreadable.
    node.error = err.code || 'EREAD';
    return node;
  }

  for (const entry of entries) {
    // Skip symlinks entirely so we don't follow them into other subtrees.
    if (entry.isSymbolicLink()) continue;
    const child = await walk(path.join(nodePath, entry.name), entry.name, node, counter, onProgress);
    node.children.push(child);
    node.size += child.size;
    node.mtime = Math.max(node.mtime, child.mtime);
  }

  return node;
}
