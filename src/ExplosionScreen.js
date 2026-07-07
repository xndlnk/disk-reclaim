// The full-screen delete "explosion": the mushroom cloud from boom.js, and on
// the final frame (`last`) a centered summary plate composed over the smoke.
// Presentational only — App owns the animation timing and the actual delete;
// this just renders the frame it's given.

import React from 'react';
import { Box, Text } from 'ink';
import htm from 'htm';
import { humanSize } from './format.js';
import { boomGrid } from './boom.js';

const html = htm.bind(React.createElement);

/** Overwrite `base` with `text` starting at column `startCol` (for centered overlays). */
function overlayLine(base, text, startCol) {
  const chars = base.split('');
  for (let i = 0; i < text.length; i++) {
    const c = startCol + i;
    if (c >= 0 && c < chars.length) chars[c] = text[i];
  }
  return chars.join('');
}

export default function ExplosionScreen({ boomFrame, last, summary }) {
  const cols = process.stdout.columns || 80;
  const H = (process.stdout.rows || 24) - 1;
  const { lines, colors } = boomGrid(cols, H, boomFrame, last);
  const summaryRows = new Set();
  if (last && summary) {
    // Compose a framed plate over the smoke, centered on screen.
    const body = [
      'R E C L A I M E D',
      '',
      `Freed  ${humanSize(summary.freed)}`,
      `Deleted  ${summary.deletedCount} item(s)` +
        (summary.failedCount ? `   (${summary.failedCount} failed)` : ''),
      '',
      'press any key to return',
    ];
    const w = Math.max(...body.map((s) => s.length));
    const plate = [
      '┌' + '─'.repeat(w + 2) + '┐',
      ...body.map((s) => '│ ' + s.padStart(Math.floor((w + s.length) / 2)).padEnd(w) + ' │'),
      '└' + '─'.repeat(w + 2) + '┘',
    ];
    const top = Math.max(0, Math.floor((H - plate.length) / 2));
    plate.forEach((line, i) => {
      const row = top + i;
      if (row < 0 || row >= lines.length) return;
      lines[row] = overlayLine(lines[row], line, Math.floor((cols - line.length) / 2));
      summaryRows.add(row);
    });
  }
  return html`
    <${Box} flexDirection="column">
      ${lines.map((line, r) => {
        const isSummary = summaryRows.has(r);
        return html`<${Text} key=${r} color=${isSummary ? 'greenBright' : colors[r]} bold=${isSummary} wrap="truncate">${line}</${Text}>`;
      })}
    </${Box}>`;
}
