import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import htm from 'htm';

import BrowseView from '../src/BrowseView.js';
import { renderToText } from '../test-support/render.js';

const html = htm.bind(React.createElement);

// --- fixtures ------------------------------------------------------------

function file(name, parent, size, extra = {}) {
  const node = { name, path: `${parent.path}/${name}`, isDir: false, size, children: [], parent, error: null, ...extra };
  parent.children.push(node);
  return node;
}
function dir(name, parent, extra = {}) {
  const path = parent ? `${parent.path}/${name}` : `/${name}`;
  const node = { name, path, isDir: true, size: 0, children: [], parent: parent ?? null, error: null, ...extra };
  if (parent) parent.children.push(node);
  return node;
}

// Render BrowseView wide enough that the list column and the fixed 36-wide cart
// sit side by side without truncating our short fixture names.
const NOW = new Date('2026-07-07T00:00:00Z').getTime();
const DAY = 86_400_000;

function render(props) {
  const base = {
    view: 'tree',
    cursor: 0,
    marked: new Map(),
    viewHeight: 10,
    mode: 'browse',
    status: '',
    now: NOW,
  };
  return renderToText(html`<${BrowseView} ...${{ ...base, ...props }} />`, { columns: 120, rows: 30 });
}

/** The output line that contains `needle` (post-ANSI-strip), or '' if none. */
function lineWith(out, needle) {
  return out.split('\n').find((l) => l.includes(needle)) ?? '';
}

// --- header + basic rows -------------------------------------------------

test('BrowseView: tree header shows the current path, size, and item count', () => {
  const root = dir('scan', null);
  root.size = 300;
  const src = dir('src', root);
  src.size = 200;
  const a = file('a.txt', root, 100);
  const out = render({ root, current: root, rows: [src, a], total: 300 });
  assert.match(out, /\/scan/);
  assert.match(out, /— 300 B, 2 items/);
});

test('BrowseView: tree rows show size, a leading slash for dirs, and a space for files', () => {
  const root = dir('scan', null);
  root.size = 300;
  const src = dir('src', root);
  src.size = 200;
  file('a.txt', root, 100);
  const out = render({ root, current: root, rows: root.children, total: 300 });
  const dirLine = lineWith(out, 'src');
  assert.ok(dirLine.includes('200 B') && dirLine.includes('/src'), `dir row: ${dirLine}`);
  const fileLine = lineWith(out, 'a.txt');
  assert.ok(fileLine.includes('100 B'), `file row: ${fileLine}`);
  assert.ok(!fileLine.includes('/a.txt'), 'a file row must not get the dir slash');
});

// --- age column ----------------------------------------------------------

test('BrowseView: old rows show a dim age token, recent rows show none, aligned', () => {
  const root = dir('scan', null);
  const oldFile = file('old.bin', root, 100, { mtime: NOW - 400 * DAY });
  const freshFile = file('fresh.bin', root, 100, { mtime: NOW - 1000 });
  const out = render({ root, current: root, rows: [oldFile, freshFile], total: 200 });

  const oldLine = lineWith(out, 'old.bin');
  const freshLine = lineWith(out, 'fresh.bin');
  assert.ok(oldLine.includes('1y'), `old row should show an age token: ${oldLine}`);
  assert.ok(!/\d(d|w|mo|y)\b/.test(freshLine), `recent row shows no age token: ${freshLine}`);
  // The blank age column keeps the name column aligned across both rows.
  assert.equal(oldLine.indexOf('old.bin'), freshLine.indexOf('fresh.bin'), 'names stay aligned');
});

// --- selection + marks ---------------------------------------------------

test('BrowseView: the cursor row is marked with ▶, and only that row', () => {
  const root = dir('scan', null);
  const rows = [file('x0', root, 30), file('x1', root, 20), file('x2', root, 10)];
  const out = render({ root, current: root, rows, total: 60, cursor: 1 });
  assert.equal((out.match(/▶/g) ?? []).length, 1, 'exactly one cursor marker');
  assert.ok(lineWith(out, 'x1').includes('▶'), 'cursor marker sits on the cursor row');
  assert.ok(!lineWith(out, 'x0').includes('▶'), 'non-cursor row has no marker');
});

test('BrowseView: marked rows show ✓', () => {
  const root = dir('scan', null);
  const a = file('a', root, 30);
  const b = file('b', root, 20);
  const out = render({ root, current: root, rows: [a, b], total: 50, marked: new Map([[a.path, a]]) });
  assert.ok(lineWith(out, ' a').includes('✓'), 'marked row shows a check');
  assert.ok(!lineWith(out, ' b').includes('✓'), 'unmarked row has no check');
});

// --- scrolling window ----------------------------------------------------

test('BrowseView: only the window around the cursor is rendered', () => {
  const root = dir('scan', null);
  const rows = Array.from({ length: 20 }, (_, i) =>
    file(`row${String(i).padStart(2, '0')}`, root, 20 - i)
  );
  // viewHeight 5, cursor 10 -> windowFor centers: rows 08..12 are visible.
  const out = render({ root, current: root, rows, total: 210, cursor: 10, viewHeight: 5 });
  for (const visible of ['row08', 'row10', 'row12']) assert.match(out, new RegExp(visible));
  for (const hidden of ['row00', 'row07', 'row13', 'row19'])
    assert.doesNotMatch(out, new RegExp(hidden));
  assert.ok(lineWith(out, 'row10').includes('▶'), 'cursor stays visible in the window');
});

// --- cart sidebar --------------------------------------------------------

test('BrowseView: empty cart shows the placeholder and a zero count', () => {
  const root = dir('scan', null);
  const a = file('a', root, 30);
  const out = render({ root, current: root, rows: [a], total: 30 });
  assert.match(out, /Reclaim cart \(0\)/);
  assert.match(out, /Nothing marked\./);
});

test('BrowseView: cart dedups marks nested under another mark (count + total)', () => {
  // Marking both a folder and something inside it must count the folder once.
  const root = dir('scan', null);
  root.size = 100;
  const a = dir('A', root);
  a.size = 100;
  const b = dir('B', a); // inside A
  b.size = 100;
  const marked = new Map([[a.path, a], [b.path, b]]);
  const out = render({ root, current: root, rows: [a], total: 100, marked });
  assert.match(out, /Reclaim cart \(1\)/); // not (2)
  assert.ok(lineWith(out, 'Total:').includes('100 B'), 'total counts A once, not 200 B');
});

test('BrowseView: cart truncates past viewHeight with an "…and N more" note', () => {
  const root = dir('scan', null);
  const marks = Array.from({ length: 5 }, (_, i) => file(`m${i}`, root, 10));
  const marked = new Map(marks.map((n) => [n.path, n]));
  const out = render({ root, current: root, rows: marks, total: 50, marked, viewHeight: 2 });
  assert.match(out, /Reclaim cart \(5\)/);
  assert.ok(lineWith(out, 'Total:').includes('50 B'));
  assert.match(out, /…and 3 more/);
});

test('BrowseView: an NFD umlaut name is precomposed to NFC in list and cart', () => {
  // On disk the name arrives decomposed: "für" as f, u, U+0308, r. The combining
  // mark renders in its own cell in many terminals and knocks the cart border
  // one column off — so display strings must be precomposed before layout.
  const root = dir('scan', null);
  const nfd = 'für';
  const f = file(nfd, root, 40);
  const out = render({ root, current: root, rows: [f], total: 40, marked: new Map([[f.path, f]]) });
  assert.ok(!out.includes('̈'), 'no combining diaeresis should survive to the screen');
  assert.ok(out.includes('für'), 'name renders with the precomposed ü (U+00FC)');
});

// --- largest view --------------------------------------------------------

test('BrowseView: largest view shows the root, a files header, and paths relative to root', () => {
  const root = dir('scan', null);
  root.size = 500;
  const src = dir('src', root);
  const big = file('big.bin', src, 500);
  const out = render({ root, current: root, view: 'largest', rows: [big], total: 500 });
  assert.match(out, /— largest 1 files/);
  assert.doesNotMatch(out, /\(of /); // note only appears above LARGEST_LIMIT files
  assert.match(out, /src\/big\.bin/); // relative path, not just the name
});

// --- empty states --------------------------------------------------------

test('BrowseView: an unreadable folder reports its error inline', () => {
  const root = dir('scan', null);
  const locked = dir('locked', root, { error: 'EACCES' });
  const out = render({ root, current: locked, rows: [], total: 1 });
  assert.match(out, /\(empty — EACCES\)/);
});

test('BrowseView: largest view with no files says so', () => {
  const root = dir('scan', null);
  const out = render({ root, current: root, view: 'largest', rows: [], total: 1 });
  assert.match(out, /\(no files\)/);
});

// --- footer: hints, confirm prompt, status -------------------------------

test('BrowseView: footer hint differs between tree and largest views', () => {
  const root = dir('scan', null);
  const a = file('a', root, 10);
  assert.match(render({ root, current: root, rows: [a], total: 10 }), /← up · l largest/);
  assert.match(
    render({ root, current: root, view: 'largest', rows: [a], total: 10 }),
    /← back · l browse/
  );
});

test('BrowseView: confirm mode replaces the hint with the delete prompt', () => {
  const root = dir('scan', null);
  const a = file('a', root, 200);
  const out = render({ root, current: root, rows: [a], total: 200, marked: new Map([[a.path, a]]), mode: 'confirm' });
  assert.match(out, /Delete 1 item\(s\) and free 200 B\?/);
  assert.match(out, /Press y to confirm/);
  assert.doesNotMatch(out, /l largest/); // the hint line is gone
});

test('BrowseView: a status message is shown when present', () => {
  const root = dir('scan', null);
  const a = file('a', root, 10);
  const out = render({ root, current: root, rows: [a], total: 10, status: 'Cleared all marks.' });
  assert.match(out, /Cleared all marks\./);
});
