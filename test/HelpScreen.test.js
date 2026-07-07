import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import htm from 'htm';

import HelpScreen from '../src/HelpScreen.js';
import { RULES } from '../src/rules.js';
import { renderToText } from '../test-support/render.js';

const html = htm.bind(React.createElement);

// Render wide so the wrap="wrap" paragraphs stay on one line and substring
// assertions don't trip over a mid-word line break.
const help = () => renderToText(html`<${HelpScreen} />`, { columns: 200, rows: 80 });

test('HelpScreen: shows the title and one-line summary', () => {
  const out = help();
  assert.match(out, /disk-reclaim — help/);
  assert.match(out, /Browse a directory tree, mark space hogs into a cart/);
});

test('HelpScreen: lists representative key bindings with their descriptions', () => {
  const out = help();
  assert.match(out, /Space \/ m/);
  assert.match(out, /mark item into the reclaim cart/);
  assert.match(out, /delete everything in the cart/);
  assert.match(out, /clear the cart/);
});

test('HelpScreen: documents every rule from the RULES registry', () => {
  const out = help();
  // The help page is the user-facing surface of rules.js — adding a rule should
  // surface it here, so assert each rule's label and description are present.
  assert.ok(RULES.length > 0, 'expected at least one rule to test against');
  for (const rule of RULES) {
    assert.ok(out.includes(`${rule.label}/`), `missing rule label: ${rule.label}/`);
    assert.ok(out.includes(rule.desc), `missing rule desc: ${rule.desc}`);
  }
});

test('HelpScreen: explains where and how to add your own rule', () => {
  const out = help();
  assert.match(out, /Adding your own rules/);
  assert.match(out, /src\/rules\.js/);
});

test('HelpScreen: tells the user how to dismiss it', () => {
  assert.match(help(), /Press any key to return\./);
});
