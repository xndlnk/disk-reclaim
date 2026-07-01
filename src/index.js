#!/usr/bin/env node
import React from 'react';
import { render, Text, Box } from 'ink';
import htm from 'htm';
import { scan } from './scan.js';
import App from './App.js';

const html = htm.bind(React.createElement);

const target = process.argv[2] || process.cwd();

// Simple loading screen while the tree is walked. We render, mutate a counter,
// and re-render on progress so large drives don't look frozen.
let setCount;
function Loading() {
  const [count, _setCount] = React.useState(0);
  setCount = _setCount;
  return html`<${Box}><${Text} color="cyan">Scanning </${Text}><${Text}>${target}</${Text}><${Text} color="gray"> … ${count.toLocaleString()} files</${Text}></${Box}>`;
}

const loader = render(html`<${Loading} />`);
try {
  const root = await scan(target, (n) => setCount && setCount(n));
  loader.unmount();
  loader.clear();
  render(html`<${App} root=${root} />`);
} catch (err) {
  loader.unmount();
  console.error(`disk-reclaim: could not scan "${target}": ${err.message}`);
  process.exit(1);
}
