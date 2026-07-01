import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import htm from 'htm';
import { humanSize, bar } from './format.js';
import { topLevelMarked, reclaimableBytes, deleteNodes, removeFromTree } from './reclaim.js';
import { findMatches } from './rules.js';

const html = htm.bind(React.createElement);

/** Children sorted largest-first — the whole point of the tool. */
function sortedChildren(node) {
  return [...node.children].sort((a, b) => b.size - a.size);
}

/** Compute which slice of a list is visible so the cursor stays on screen. */
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
  const [marked, setMarked] = useState(() => new Map()); // path -> node
  const [mode, setMode] = useState('browse'); // 'browse' | 'confirm' | 'deleting'
  const [status, setStatus] = useState('');
  const [history] = useState(() => new Map()); // remembered cursor per folder

  const rows = sortedChildren(current);
  const total = current.size || 1;
  const viewHeight = Math.max(3, (process.stdout.rows || 24) - 7);

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

  const applyRules = () => {
    const matches = findMatches(root); // whole tree, from the scan root
    if (matches.length === 0) {
      setStatus('No reclaimable matches found.');
      return;
    }
    const next = new Map(marked);
    let added = 0;
    for (const n of matches) {
      if (!next.has(n.path)) {
        next.set(n.path, n);
        added += 1;
      }
    }
    setMarked(next);
    setStatus(
      `Rules matched ${matches.length} folder(s) — added ${added}, cart now ${humanSize(reclaimableBytes(next))}.`
    );
  };

  const toggleMark = (node) => {
    if (!node) return;
    const next = new Map(marked);
    if (next.has(node.path)) next.delete(node.path);
    else next.set(node.path, node);
    setMarked(next);
    setStatus('');
  };

  const performDelete = async () => {
    setMode('deleting');
    const targets = topLevelMarked(marked);
    const { deleted, failed } = await deleteNodes(targets);
    const freed = deleted.reduce((s, n) => s + n.size, 0);
    for (const n of deleted) removeFromTree(n);
    // Keep only the failed ones marked so the user can see what didn't delete.
    const next = new Map();
    for (const f of failed) next.set(f.node.path, f.node);
    setMarked(next);
    setCursor((c) => Math.min(c, Math.max(0, sortedChildren(current).length - 1)));
    setStatus(
      `Freed ${humanSize(freed)} — deleted ${deleted.length} item(s)` +
        (failed.length ? `, ${failed.length} failed` : '')
    );
    setMode('browse');
  };

  useInput((input, key) => {
    if (mode === 'deleting') return;

    if (mode === 'confirm') {
      if (input === 'y' || input === 'Y') performDelete();
      else {
        setMode('browse');
        setStatus('Deletion cancelled.');
      }
      return;
    }

    // browse mode
    if (input === 'q' || (key.ctrl && input === 'c')) return exit();
    else if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(rows.length - 1, c + 1));
    else if (key.return || key.rightArrow || input === 'l') enter(rows[cursor]);
    else if (key.leftArrow || input === 'h' || key.backspace || key.delete) goUp();
    else if (input === 'g') setCursor(0);
    else if (input === 'G') setCursor(Math.max(0, rows.length - 1));
    else if (input === ' ' || input === 'm') toggleMark(rows[cursor]);
    else if (input === 'r') applyRules();
    else if (input === 'c' && marked.size) {
      setMarked(new Map());
      setStatus('Cleared all marks.');
    } else if (input === 'd' && marked.size) setMode('confirm');
  });

  const { start, end } = windowFor(cursor, rows.length, viewHeight);
  const visible = rows.slice(start, end);
  const reclaim = reclaimableBytes(marked);
  const markedList = topLevelMarked(marked).sort((a, b) => b.size - a.size);

  return html`
    <${Box} flexDirection="column">
      <${Box}>
        <${Text} color="cyan" bold>${' '}${current.path}${' '}</${Text}>
        <${Text} color="gray">— ${humanSize(current.size)}, ${rows.length} items</${Text}>
      </${Box}>

      <${Box} marginTop=${1}>
        <${Box} flexDirection="column" flexGrow=${1}>
          ${rows.length === 0
            ? html`<${Text} color="gray">${'  '}(empty${current.error ? ` — ${current.error}` : ''})</${Text}>`
            : visible.map((child, i) => {
                const idx = start + i;
                const selected = idx === cursor;
                const isMarked = marked.has(child.path);
                const frac = child.size / total;
                const color = isMarked ? 'yellow' : child.isDir ? 'blue' : 'white';
                return html`
                  <${Text} key=${child.path} inverse=${selected} color=${color} wrap="truncate">
                    ${selected ? '▶' : ' '}${isMarked ? '✓' : ' '}${' '}
                    ${humanSize(child.size).padStart(9)}${' '}
                    <${Text} color=${isMarked ? 'yellow' : 'gray'}>${bar(frac)}${' '}${String(Math.round(frac * 100)).padStart(3)}%</${Text}>${' '}
                    ${child.isDir ? '/' : ' '}${child.name}${child.error ? ` !${child.error}` : ''}
                  </${Text}>`;
              })}
        </${Box}>

        <${Box} flexDirection="column" width=${36} borderStyle="round" borderColor=${marked.size ? 'yellow' : 'gray'} paddingX=${1}>
          <${Text} color="yellow" bold>Reclaim cart (${markedList.length})</${Text}>
          <${Text}>Total: <${Text} color="yellow" bold>${humanSize(reclaim)}</${Text}></${Text}>
          <${Box} flexDirection="column" marginTop=${1}>
            ${markedList.length === 0
              ? html`<${Text} color="gray">Nothing marked.\nPress <${Text} color="white">space</${Text}> on an item\nto add it here.</${Text}>`
              : markedList.slice(0, viewHeight).map(
                  (n) => html`
                    <${Text} key=${n.path} wrap="truncate">
                      <${Text} color="gray">${humanSize(n.size).padStart(9)}</${Text}> ${n.isDir ? '/' : ''}${n.name}
                    </${Text}>`
                )}
            ${markedList.length > viewHeight
              ? html`<${Text} color="gray">…and ${markedList.length - viewHeight} more</${Text}>`
              : null}
          </${Box}>
        </${Box}>
      </${Box}>

      <${Box} marginTop=${1} flexDirection="column">
        ${mode === 'confirm'
          ? html`<${Text} color="red" bold>${' '}Delete ${markedList.length} item(s) and free ${humanSize(reclaim)}? Press y to confirm, any other key to cancel.</${Text}>`
          : mode === 'deleting'
            ? html`<${Text} color="yellow">${' '}Deleting…</${Text}>`
            : html`<${Text} color="gray">space mark · r rules · d delete cart · c clear · ↑↓ move · →/Enter open · ← up · q quit</${Text}>`}
        ${status ? html`<${Text} color="green">${' '}${status}</${Text}>` : null}
      </${Box}>
    </${Box}>`;
}
