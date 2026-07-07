import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import htm from 'htm';
import { humanSize, bar, barColor, relativePath } from './format.js';
import { topLevelMarked, reclaimableBytes, deleteNodes, removeFromTree } from './reclaim.js';
import { findMatches, RULES } from './rules.js';
import { largestFiles, countFiles } from './largest.js';
import { boomGrid, BOOM_STEPS } from './boom.js';
import { playBoom } from './sound.js';

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

export default function App({ root, sound = true }) {
  const { exit } = useApp();
  const [current, setCurrent] = useState(root);
  const [cursor, setCursor] = useState(0);
  const [marked, setMarked] = useState(() => new Map()); // path -> node
  const [mode, setMode] = useState('browse'); // 'browse' | 'confirm' | 'exploding' | 'boom-done'
  const [boomFrame, setBoomFrame] = useState(0); // mushroom-cloud step while mode === 'exploding'
  const [summary, setSummary] = useState(null); // { freed, deletedCount, failedCount } shown on 'boom-done'
  const [view, setView] = useState('browse'); // 'browse' | 'largest'
  const [status, setStatus] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [history] = useState(() => new Map()); // remembered cursor per folder

  const rows = view === 'largest' ? largestFiles(root, 50) : sortedChildren(current);
  const total = (view === 'largest' ? root.size : current.size) || 1;
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
    const matches = findMatches(current); // from the folder the user is in
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

  // Delete the cart and update the tree in place. Returns a summary; the caller
  // (the explosion effect) owns the mode transition so the animation can cover it.
  const performDelete = async () => {
    const targets = topLevelMarked(marked);
    const { deleted, failed } = await deleteNodes(targets, () => {});
    const freed = deleted.reduce((s, n) => s + n.size, 0);
    for (const n of deleted) removeFromTree(n);
    // Keep only the failed ones marked so the user can see what didn't delete.
    const next = new Map();
    for (const f of failed) next.set(f.node.path, f.node);
    setMarked(next);
    const remaining = view === 'largest' ? largestFiles(root, 50) : sortedChildren(current);
    setCursor((c) => Math.min(c, Math.max(0, remaining.length - 1)));
    return { freed, deletedCount: deleted.length, failedCount: failed.length };
  };

  // On 'exploding': grow the mushroom cloud while the delete runs (with a short
  // floor so it's always visible), holding at full height once risen, then freeze
  // on the settled smoke frame and show the summary.
  useEffect(() => {
    if (mode !== 'exploding') return;
    let cancelled = false;
    if (sound) playBoom(); // fire-and-forget, synced to the blast; silent if unavailable
    const id = setInterval(() => setBoomFrame((f) => Math.min(f + 1, BOOM_STEPS - 2)), 90);
    (async () => {
      const [result] = await Promise.all([
        performDelete(),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      if (cancelled) return;
      clearInterval(id);
      setBoomFrame(BOOM_STEPS - 1); // freeze on the settled smoke
      setSummary(result);
      setMode('boom-done');
    })();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // performDelete closes over the marks captured when we entered 'exploding'.
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input, key) => {
    if (mode === 'exploding') {
      if (key.ctrl && input === 'c') return exit();
      return; // ignore everything while the boom is playing
    }

    if (mode === 'boom-done') {
      if (key.ctrl && input === 'c') return exit();
      // Any key clears the explosion and returns to browsing.
      setStatus(
        `Freed ${humanSize(summary.freed)} — deleted ${summary.deletedCount} item(s)` +
          (summary.failedCount ? `, ${summary.failedCount} failed` : '')
      );
      setSummary(null);
      setMode('browse');
      return;
    }

    if (showHelp) {
      if (key.ctrl && input === 'c') return exit();
      setShowHelp(false); // any key dismisses the help page
      return;
    }

    if (mode === 'confirm') {
      if (input === 'y' || input === 'Y') {
        setBoomFrame(0);
        setMode('exploding'); // the effect plays the boom, runs the delete, then freezes
      } else {
        setMode('browse');
        setStatus('Deletion cancelled.');
      }
      return;
    }

    // browse mode
    if (input === 'q' || (key.ctrl && input === 'c')) return exit();
    else if (input === '?' || input === 'h') setShowHelp(true);
    else if (input === 'l') {
      if (view === 'browse') {
        history.set(current.path, cursor);
        setView('largest');
        setCursor(0);
      } else {
        setView('browse');
        setCursor(history.get(current.path) ?? 0);
      }
    } else if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(rows.length - 1, c + 1));
    else if (key.return || key.rightArrow) {
      if (view === 'browse') enter(rows[cursor]); // no-op in largest view — nothing to open
    } else if (key.leftArrow || key.backspace || key.delete) {
      if (view === 'largest') {
        setView('browse');
        setCursor(history.get(current.path) ?? 0);
      } else goUp();
    } else if (input === 'g') setCursor(0);
    else if (input === 'G') setCursor(Math.max(0, rows.length - 1));
    else if (input === ' ' || input === 'm') toggleMark(rows[cursor]);
    else if (input === 'r') applyRules();
    else if (input === 'c' && marked.size) {
      setMarked(new Map());
      setStatus('Cleared all marks.');
    } else if (input === 'd' && marked.size) setMode('confirm');
  });

  if (showHelp) {
    const keys = [
      ['↑/↓ · k/j', 'move the cursor'],
      ['→/Enter', 'open the highlighted folder'],
      ['←/Backspace', 'go up to the parent folder'],
      ['g / G', 'jump to top / bottom'],
      ['Space / m', 'mark item into the reclaim cart'],
      ['r', 'auto-mark reclaimable folders here (rules — see below)'],
      ['l', 'toggle largest-files view (biggest files in the whole tree)'],
      ['d', 'delete everything in the cart (asks y to confirm)'],
      ['c', 'clear the cart'],
      ['? / h', 'show this help · q quit'],
    ];
    return html`
      <${Box} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX=${1}>
        <${Text} color="cyan" bold>disk-reclaim — help</${Text}>
        <${Text} dimColor=${true}>Browse a directory tree, mark space hogs into a cart, then delete them.</${Text}>

        <${Box} marginTop=${1}><${Text} color="yellow" bold>Keys</${Text}></${Box}>
        ${keys.map(
          ([k, d]) => html`
            <${Text} key=${k}><${Text} color="white">${k.padEnd(15)}</${Text}><${Text} dimColor=${true}>${d}</${Text}></${Text}>`
        )}

        <${Box} marginTop=${1}><${Text} color="yellow" bold>What does ${'`'}r${'`'} (rules) do?</${Text}></${Box}>
        <${Text} dimColor=${true} wrap="wrap">Pressing ${'`'}r${'`'} scans the folder you're in and marks well-known build & cache folders — the ones below. They're safe to delete because your tools regenerate them (a rebuild, ${'`'}npm install${'`'}, etc.). Nothing is deleted until you press ${'`'}d${'`'} and confirm.</${Text}>
        <${Box} flexDirection="column" marginTop=${1}>
          ${RULES.map(
            (rule) => html`
              <${Text} key=${rule.id}><${Text} color="blue">${(rule.label + '/').padEnd(16)}</${Text}><${Text} dimColor=${true}>${rule.desc}</${Text}></${Text}>`
          )}
        </${Box}>

        <${Box} marginTop=${1}><${Text} color="yellow" bold>Adding your own rules</${Text}></${Box}>
        <${Text} dimColor=${true} wrap="wrap">Rules live in ${'`'}src/rules.js${'`'}. Add one by pushing an entry to the ${'`'}RULES${'`'} array: ${'`'}{ id, label, desc, match(node) }${'`'}. ${'`'}match${'`'} receives a node (${'`'}{ name, isDir, ... }${'`'}) and returns ${'`'}true${'`'} to mark it — e.g. ${'`'}match: (n) => n.isDir && n.name === '.venv'${'`'}. ${'`'}label${'`'} and ${'`'}desc${'`'} are what you see listed above.</${Text}>

        <${Box} marginTop=${1}><${Text} color="green">Press any key to return.</${Text}></${Box}>
      </${Box}>`;
  }

  if (mode === 'exploding' || mode === 'boom-done') {
    const last = mode === 'boom-done';
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
              <${Text} key="meta" dimColor=${true}>— largest ${rows.length} files${fileCount > 50 ? ` (of ${fileCount.toLocaleString()} files)` : ''}</${Text}>`
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
