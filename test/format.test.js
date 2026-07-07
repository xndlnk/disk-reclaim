import { test } from 'node:test';
import assert from 'node:assert/strict';

import { humanSize, bar, barColor, relativePath, nfc, formatAge } from '../src/util/format.js';

test('humanSize: zero and sub-1 bytes render as "0 B"', () => {
  assert.equal(humanSize(0), '0 B');
  assert.equal(humanSize(0.4), '0 B');
});

test('humanSize: raw bytes stay in B with no decimals', () => {
  assert.equal(humanSize(512), '512 B');
  assert.equal(humanSize(1), '1 B');
});

test('humanSize: switches to KB with one decimal', () => {
  assert.equal(humanSize(1536), '1.5 KB');
});

test('humanSize: values >= 100 in a unit drop the decimal', () => {
  assert.equal(humanSize(150 * 1024), '150 KB');
});

test('humanSize: very large values cap at PB', () => {
  // 1024^6 would be EB; the unit list stops at PB, so it stays there.
  assert.match(humanSize(1024 ** 6), /PB$/);
});

const DAY = 86_400_000;
const NOW = new Date('2026-07-07T00:00:00Z').getTime();

test('formatAge: anything under 24h (or right now) renders as blank', () => {
  assert.equal(formatAge(NOW, NOW), '');
  assert.equal(formatAge(NOW - (DAY - 1), NOW), '');
});

test('formatAge: an unknown mtime (0) renders as blank', () => {
  assert.equal(formatAge(0, NOW), '');
});

test('formatAge: days below a week', () => {
  assert.equal(formatAge(NOW - 3 * DAY, NOW), '3d');
});

test('formatAge: the week boundary reads as weeks', () => {
  assert.equal(formatAge(NOW - 7 * DAY, NOW), '1w');
});

test('formatAge: the month boundary reads as months', () => {
  assert.equal(formatAge(NOW - 30 * DAY, NOW), '1mo');
});

test('formatAge: the year boundary reads as years', () => {
  assert.equal(formatAge(NOW - 365 * DAY, NOW), '1y');
});

test('formatAge: every token fits in the 4-wide column', () => {
  for (const diff of [1 * DAY, 6 * DAY, 29 * DAY, 364 * DAY, 3650 * DAY])
    assert.ok(formatAge(NOW - diff, NOW).length <= 4);
});

test('bar: fraction 0 is all spaces at the default width of 12', () => {
  assert.equal(bar(0), '[            ]');
});

test('bar: fraction 1 fills the whole width', () => {
  assert.equal(bar(1, 10), `[${'#'.repeat(10)}]`);
});

test('bar: half fills half the width', () => {
  assert.equal(bar(0.5, 10), '[#####     ]');
});

test('bar: clamps out-of-range fractions', () => {
  assert.equal(bar(-1, 4), '[    ]');
  assert.equal(bar(2, 4), '[####]');
});

const MB = 1024 * 1024;

test('barColor: >= 250 MB is red', () => {
  assert.equal(barColor(250 * MB), 'red');
  assert.equal(barColor(1024 * MB), 'red');
});

test('barColor: 50 MB up to 250 MB is yellow', () => {
  assert.equal(barColor(50 * MB), 'yellow');
  assert.equal(barColor(200 * MB), 'yellow');
});

test('barColor: just below 250 MB is still yellow', () => {
  assert.equal(barColor(250 * MB - 1), 'yellow');
});

test('barColor: below 50 MB is null (rendered dim)', () => {
  assert.equal(barColor(0), null);
  assert.equal(barColor(50 * MB - 1), null);
  assert.equal(barColor(1024), null);
});

test('relativePath: nested node is shown relative to the scan root', () => {
  assert.equal(relativePath('/scan', '/scan/app/node_modules'), 'app/node_modules');
});

test('relativePath: a direct child is just its name', () => {
  assert.equal(relativePath('/scan', '/scan/dist'), 'dist');
});

test('relativePath: the root itself renders as "."', () => {
  assert.equal(relativePath('/scan', '/scan'), '.');
});

test('nfc: precomposes a decomposed umlaut so display width is correct', () => {
  // "für" written NFD: f, u, combining diaeresis (U+0308), r — 4 code points.
  const decomposed = 'für';
  assert.equal(decomposed.length, 4);
  const composed = nfc(decomposed);
  assert.equal(composed, 'für');
  assert.equal(composed.length, 3); // single precomposed ü (U+00FC)
});

test('relativePath: normalizes NFD names to NFC for display', () => {
  const rel = relativePath('/scan', '/scan/für');
  assert.equal(rel, 'für');
  assert.equal(rel.length, 3);
});
