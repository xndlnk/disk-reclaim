import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import htm from 'htm';

import ExplosionScreen from '../src/ui/ExplosionScreen.js';
import { humanSize } from '../src/util/format.js';
import { renderToText } from '../test-support/render.js';

const html = htm.bind(React.createElement);

const explosion = (props) => renderToText(html`<${ExplosionScreen} ...${props} />`);

const summary = { freed: 200 * 1024 * 1024, deletedCount: 3, failedCount: 0 };

test('ExplosionScreen: mid-animation renders a frame but no summary plate', () => {
  // The plate is only composed on the last frame; a mid-blast frame with a
  // summary in hand must not leak it early.
  const out = explosion({ boomFrame: 3, last: false, summary });
  assert.ok(out.trim().length > 0, 'expected a rendered cloud frame');
  assert.doesNotMatch(out, /R E C L A I M E D/);
  assert.doesNotMatch(out, /press any key to return/);
});

test('ExplosionScreen: final frame shows the reclaimed summary plate', () => {
  const out = explosion({ boomFrame: 9, last: true, summary });
  assert.match(out, /R E C L A I M E D/);
  assert.ok(out.includes(`Freed  ${humanSize(summary.freed)}`), 'shows freed bytes');
  assert.match(out, /Deleted  3 item\(s\)/);
  assert.match(out, /press any key to return/);
});

test('ExplosionScreen: reports failures when some deletes failed', () => {
  const out = explosion({ boomFrame: 9, last: true, summary: { ...summary, failedCount: 2 } });
  assert.match(out, /\(2 failed\)/);
});

test('ExplosionScreen: no "(failed)" note when nothing failed', () => {
  const out = explosion({ boomFrame: 9, last: true, summary });
  assert.doesNotMatch(out, /failed/);
});

test('ExplosionScreen: last frame without a summary renders without throwing', () => {
  // Guarded by `if (last && summary)` — should draw the settled smoke, no plate.
  const out = explosion({ boomFrame: 9, last: true, summary: null });
  assert.ok(out.trim().length > 0);
  assert.doesNotMatch(out, /R E C L A I M E D/);
});
