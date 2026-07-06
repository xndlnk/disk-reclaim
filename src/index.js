#!/usr/bin/env node
import React from 'react';
import { render, Text, Box } from 'ink';
import htm from 'htm';
import { scan } from './scan.js';
import { humanSize } from './format.js';
import App from './App.js';

const html = htm.bind(React.createElement);

const target = process.argv[2] || process.cwd();

// Loading screen while the tree is walked. The total is unknown until the walk
// finishes, so instead of a percentage bar we show a spinner plus a live
// files/bytes readout, re-rendering on progress so large drives don't look
// frozen. The spinner keeps moving even while a single slow directory stalls.
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let setProgress;
function Loading() {
  const [{ files, bytes, dir }, _setProgress] = React.useState({ files: 0, bytes: 0, dir: '' });
  const [frame, setFrame] = React.useState(0);
  setProgress = _setProgress;
  React.useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  return html`<${Box} flexDirection="column">
    <${Box}>
      <${Text} color="cyan">${FRAMES[frame]} Scanning </${Text}><${Text}>${target}</${Text}>
      <${Text} dimColor=${true}> … ${files.toLocaleString()} files, ${humanSize(bytes)}</${Text}>
    </${Box}>
    <${Text} dimColor=${true} wrap="truncate-middle">${'  '}${dir || target}</${Text}>
  </${Box}>`;
}

const loader = render(html`<${Loading} />`);
try {
  const root = await scan(target, (p) => setProgress && setProgress(p));
  loader.unmount();
  loader.clear();
  render(html`<${App} root=${root} />`);
} catch (err) {
  loader.unmount();
  console.error(`disk-reclaim: could not scan "${target}": ${err.message}`);
  process.exit(1);
}
