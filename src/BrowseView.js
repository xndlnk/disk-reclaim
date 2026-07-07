// The main browse UI: the scrolling list (folder children or whole-tree largest
// files), the reclaim-cart sidebar, and the footer (hint line, confirm prompt,
// or status). Presentational — App owns the state and passes it in; this derives
// only its own display data (the visible window, cart totals) from those props.

import React from 'react';
import { Box, Text } from 'ink';
import htm from 'htm';
import { humanSize, bar, barColor, relativePath } from './format.js';
import { topLevelMarked, reclaimableBytes } from './reclaim.js';
import { countFiles, LARGEST_LIMIT } from './largest.js';

const html = htm.bind(React.createElement);

/** Compute which slice of a list is visible so the cursor stays on screen. */
function windowFor(cursor, total, height) {
  if (total <= height) return { start: 0, end: total };
  let start = cursor - Math.floor(height / 2);
  start = Math.max(0, Math.min(start, total - height));
  return { start, end: start + height };
}

export default function BrowseView({
  root,
  current,
  view,
  rows,
  cursor,
  total,
  marked,
  viewHeight,
  mode,
  status,
}) {
  const { start, end } = windowFor(cursor, rows.length, viewHeight);
  const visible = rows.slice(start, end);
  const reclaim = reclaimableBytes(marked);
  const markedList = topLevelMarked(marked).sort((a, b) => b.size - a.size);
  const fileCount = view === 'largest' ? countFiles(root) : 0;

  return html`
    <${Box} flexDirection="column">
      <${Box}>
        ${view === 'largest'
          ? html`
              <${Text} key="path" color="cyan" bold>${' '}${root.path}${' '}</${Text}>
              <${Text} key="meta" dimColor=${true}>— largest ${rows.length} files${fileCount > LARGEST_LIMIT ? ` (of ${fileCount.toLocaleString()} files)` : ''}</${Text}>`
          : html`
              <${Text} key="path" color="cyan" bold>${' '}${current.path}${' '}</${Text}>
              <${Text} key="meta" dimColor=${true}>— ${humanSize(current.size)}, ${rows.length} items</${Text}>`}
      </${Box}>

      <${Box} marginTop=${1}>
        <${Box} flexDirection="column" flexGrow=${1}>
          ${rows.length === 0
            ? html`<${Text} dimColor=${true}>${'  '}(${view === 'largest' ? 'no files' : `empty${current.error ? ` — ${current.error}` : ''}`})</${Text}>`
            : visible.map((child, i) => {
                const idx = start + i;
                const selected = idx === cursor;
                const isMarked = marked.has(child.path);
                const frac = child.size / total;
                const color = isMarked ? 'yellow' : child.isDir ? 'blue' : 'white';
                const bColor = barColor(child.size);
                return html`
                  <${Text} key=${child.path} inverse=${selected} color=${color} wrap="truncate">
                    ${selected ? '▶' : ' '}${isMarked ? '✓' : ' '}${' '}
                    ${humanSize(child.size).padStart(9)}${' '}
                    <${Text} color=${bColor ?? undefined} dimColor=${bColor === null}>${bar(frac)}${' '}${String(Math.round(frac * 100)).padStart(3)}%</${Text}>${' '}
                    ${view === 'largest'
                      ? html`${relativePath(root.path, child.path)}`
                      : html`${child.isDir ? '/' : ' '}${child.name}${child.error ? ` !${child.error}` : ''}`}
                  </${Text}>`;
              })}
        </${Box}>

        <${Box} flexDirection="column" width=${36} borderStyle="round" borderColor=${marked.size ? 'yellow' : 'gray'} paddingX=${1}>
          <${Text} color="yellow" bold>Reclaim cart (${markedList.length})</${Text}>
          <${Text}>Total: <${Text} color="yellow" bold>${humanSize(reclaim)}</${Text}></${Text}>
          <${Box} flexDirection="column" marginTop=${1}>
            ${markedList.length === 0
              ? html`<${Text} dimColor=${true}>Nothing marked.\nPress <${Text} color="white">space</${Text}> on an item\nto add it here.</${Text}>`
              : markedList.slice(0, viewHeight).map(
                  (n) => html`
                    <${Text} key=${n.path} wrap="truncate-middle">
                      <${Text} dimColor=${true}>${humanSize(n.size).padStart(9)}</${Text}> ${relativePath(root.path, n.path)}${n.isDir ? '/' : ''}
                    </${Text}>`
                )}
            ${markedList.length > viewHeight
              ? html`<${Text} dimColor=${true}>…and ${markedList.length - viewHeight} more</${Text}>`
              : null}
          </${Box}>
        </${Box}>
      </${Box}>

      <${Box} marginTop=${1} flexDirection="column">
        ${mode === 'confirm'
          ? html`<${Text} color="red" bold>${' '}Delete ${markedList.length} item(s) and free ${humanSize(reclaim)}? Press y to confirm, any other key to cancel.</${Text}>`
          : view === 'largest'
            ? html`<${Text} dimColor=${true}>space mark · r rules · d delete cart · c clear · ↑↓ move · ← back · l browse · h help · q quit</${Text}>`
            : html`<${Text} dimColor=${true}>space mark · r rules · d delete cart · c clear · ↑↓ move · →/Enter open · ← up · l largest · h help · q quit</${Text}>`}
        ${status ? html`<${Text} color="green">${' '}${status}</${Text}>` : null}
      </${Box}>
    </${Box}>`;
}
