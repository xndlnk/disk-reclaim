/**
 * Rules that identify reclaimable, regenerable directories by name — build
 * artifacts and dependency caches that can be safely deleted and rebuilt.
 *
 * Each rule: { id, label, match(node) -> boolean }. Add a new rule by pushing
 * to RULES; `match` gets a scan.js node ({ name, isDir, ... }).
 */
export const RULES = [
  { id: 'node_modules', label: 'node_modules', match: (n) => n.isDir && n.name === 'node_modules' },
  { id: 'dist', label: 'dist', match: (n) => n.isDir && n.name === 'dist' },
  { id: 'build', label: 'build', match: (n) => n.isDir && n.name === 'build' },
  { id: 'next', label: '.next', match: (n) => n.isDir && n.name === '.next' },
  { id: 'target', label: 'target', match: (n) => n.isDir && n.name === 'target' },
  { id: 'pycache', label: '__pycache__', match: (n) => n.isDir && n.name === '__pycache__' },
  { id: 'gradle', label: '.gradle', match: (n) => n.isDir && n.name === '.gradle' },
];

/**
 * Walk from `root` and return every node matched by any rule. When a directory
 * matches we do NOT descend into it — its contents are already covered, and this
 * prevents nested duplicates (e.g. a node_modules inside another node_modules).
 */
export function findMatches(root, rules = RULES) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (rules.some((r) => r.match(node))) {
      out.push(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}
