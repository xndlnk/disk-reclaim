import React, { useState, useEffect } from 'react';
import { useApp, useInput } from 'ink';
import htm from 'htm';
import { humanSize } from './format.js';
import { topLevelMarked, reclaimableBytes, deleteNodes, removeFromTree } from './reclaim.js';
import { findMatches } from './rules.js';
import { largestFiles, LARGEST_LIMIT } from './largest.js';
import { BOOM_STEPS } from './boom.js';
import { playBoom } from './sound.js';
import HelpScreen from './HelpScreen.js';
import ExplosionScreen from './ExplosionScreen.js';
import BrowseView from './BrowseView.js';

const html = htm.bind(React.createElement);

/** Children sorted largest-first — the whole point of the tool. */
function sortedChildren(node) {
  return [...node.children].sort((a, b) => b.size - a.size);
}

export default function App({ root, sound = true }) {
  const { exit } = useApp();
  const [current, setCurrent] = useState(root);
  const [cursor, setCursor] = useState(0);
  const [marked, setMarked] = useState(() => new Map()); // path -> node
  const [mode, setMode] = useState('browse'); // 'browse' | 'confirm' | 'exploding' | 'boom-done'
  const [boomFrame, setBoomFrame] = useState(0); // mushroom-cloud step while mode === 'exploding'
  const [summary, setSummary] = useState(null); // { freed, deletedCount, failedCount } shown on 'boom-done'
  const [view, setView] = useState('tree'); // 'tree' | 'largest' — which list is shown
  const [status, setStatus] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [history] = useState(() => new Map()); // remembered cursor per folder

  // The list under the cursor: whole-tree largest files, or the current folder's children.
  const currentRows = () =>
    view === 'largest' ? largestFiles(root, LARGEST_LIMIT) : sortedChildren(current);
  const rows = currentRows();
  const total = (view === 'largest' ? root.size : current.size) || 1;
  const viewHeight = Math.max(3, (process.stdout.rows || 24) - 7);
  const now = Date.now(); // one time reference per render, so every row's age agrees

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
    const remaining = currentRows();
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
      if (view === 'tree') {
        history.set(current.path, cursor);
        setView('largest');
        setCursor(0);
      } else {
        setView('tree');
        setCursor(history.get(current.path) ?? 0);
      }
    } else if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(rows.length - 1, c + 1));
    else if (key.return || key.rightArrow) {
      if (view === 'tree') enter(rows[cursor]); // no-op in largest view — nothing to open
    } else if (key.leftArrow || key.backspace || key.delete) {
      if (view === 'largest') {
        setView('tree');
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

  if (showHelp) return html`<${HelpScreen} />`;

  if (mode === 'exploding' || mode === 'boom-done') {
    return html`<${ExplosionScreen} boomFrame=${boomFrame} last=${mode === 'boom-done'} summary=${summary} />`;
  }

  return html`<${BrowseView}
    root=${root}
    current=${current}
    view=${view}
    rows=${rows}
    cursor=${cursor}
    total=${total}
    marked=${marked}
    viewHeight=${viewHeight}
    mode=${mode}
    status=${status}
    now=${now}
  />`;
}
