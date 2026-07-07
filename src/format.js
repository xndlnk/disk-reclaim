import path from 'node:path';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Human-readable byte size, e.g. 1536 -> "1.5 KB". */
export function humanSize(bytes) {
  if (bytes < 1) return '0 B';
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exp;
  const digits = value >= 100 || exp === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[exp]}`;
}

/** A fixed-width proportional bar, e.g. "[####      ]". */
export function bar(fraction, width = 12) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return `[${'#'.repeat(filled)}${' '.repeat(width - filled)}]`;
}

const MB = 1024 * 1024;

/**
 * Heat color for a row by absolute size: red >= 250 MB, yellow >= 50 MB.
 * Below that returns null, meaning "no explicit color" — the caller renders
 * it dimmed (theme-adaptive) rather than a fixed gray.
 */
export function barColor(bytes) {
  if (bytes >= 250 * MB) return 'red';
  if (bytes >= 50 * MB) return 'yellow';
  return null;
}

/**
 * Normalize a string to Unicode NFC for display only.
 *
 * Filenames often reach us decomposed (NFD) — e.g. "ü" as "u" + combining
 * U+0308. Terminals frequently render that combining mark in its own cell
 * (visible width 2) while the layout measures it as width 1, so a bordered box
 * ends up one column off. Precomposing to NFC makes measurement and display
 * agree. Only ever use this on text we print — never on paths/names passed to
 * the filesystem, which must stay byte-exact.
 */
export function nfc(str) {
  return str.normalize('NFC');
}

/** A node's path relative to the scanned root, for display. Root itself -> ".". */
export function relativePath(rootPath, nodePath) {
  const rel = path.relative(rootPath, nodePath);
  return nfc(rel === '' ? '.' : rel);
}
