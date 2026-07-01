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
