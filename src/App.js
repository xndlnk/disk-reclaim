import React, { useState, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import htm from 'htm';
import { humanSize, bar } from './format.js';

const html = htm.bind(React.createElement);

/** Children sorted largest-first — the whole point of the tool. */
function sortedChildren(node) {
  return [...node.children].sort((a, b) => b.size - a.size);
}

/** Compute which slice of the list is visible so the cursor stays on screen. */
function windowFor(cursor, total, height) {
  if (total <= height) return { start: 0, end: total };
  let start = cursor - Math.floor(height / 2);
  start = Math.max(0, Math.min(start, total - height));
  return { start, end: start + height };
}

export default function App({ root }) {
  const { exit } = useApp();
  const [current, setCurrent] = useState(root);
  const [cursor, setCursor] = useState(0);
  // Remembered cursor position per directory path, so going back feels natural.
  const [history] = useState(() => new Map());

  const rows = sortedChildren(current);
  const total = current.size || 1;
  const viewHeight = Math.max(3, (process.stdout.rows || 24) - 6);

  const enter = (target) => {
    if (!target || !target.isDir) return;
    history.set(current.path, cursor);
    setCurrent(target);
    setCursor(history.get(target.path) ?? 0);
  };

  const goUp = () => {
    if (!current.parent) return;
    history.set(current.path, cursor);
    const parent = current.parent;
    setCurrent(parent);
    setCursor(history.get(parent.path) ?? 0);
  };

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) return exit();
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(rows.length - 1, c + 1));
    else if (key.return || key.rightArrow || input === 'l') enter(rows[cursor]);
    else if (key.leftArrow || input === 'h' || key.backspace || key.delete) goUp();
    else if (input === 'g') setCursor(0);
    else if (input === 'G') setCursor(Math.max(0, rows.length - 1));
  });

  const { start, end } = windowFor(cursor, rows.length, viewHeight);
  const visible = rows.slice(start, end);

  const header = useMemo(() => current.path, [current.path]);

  return html`
    <${Box} flexDirection="column">
      <${Box}>
        <${Text} color="cyan" bold>${' '}${header}${' '}</${Text}>
        <${Text} color="gray">— ${humanSize(current.size)}, ${rows.length} items</${Text}>
      </${Box}>
      <${Box} flexDirection="column" marginTop=${1}>
        ${rows.length === 0
          ? html`<${Text} color="gray">${'  '}(empty${current.error ? ` — ${current.error}` : ''})</${Text}>`
          : visible.map((child, i) => {
              const idx = start + i;
              const selected = idx === cursor;
              const frac = child.size / total;
              return html`
                <${Text} key=${child.path} inverse=${selected} color=${child.isDir ? 'blue' : 'white'} wrap="truncate">
                  ${selected ? '▶ ' : '  '}
                  ${humanSize(child.size).padStart(9)}${' '}
                  <${Text} color="gray">${bar(frac)}${' '}${String(Math.round(frac * 100)).padStart(3)}%</${Text}>${' '}
                  ${child.isDir ? '/' : ' '}${child.name}${child.error ? ` !${child.error}` : ''}
                </${Text}>`;
            })}
      </${Box}>
      <${Box} marginTop=${1}>
        <${Text} color="gray">↑/↓ move · →/Enter open · ←/Backspace up · g/G top/bottom · q quit</${Text}>
      </${Box}>
    </${Box}>`;
}
