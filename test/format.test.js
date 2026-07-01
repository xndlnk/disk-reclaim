import { test } from 'node:test';
import assert from 'node:assert/strict';

import { humanSize, bar } from '../src/format.js';

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
