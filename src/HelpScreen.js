// The full-screen help overlay: key bindings, an explanation of what the `r`
// rules do, and how to add your own. Purely presentational and static — App
// shows it while `showHelp` is set and dismisses it on the next keypress.

import React from 'react';
import { Box, Text } from 'ink';
import htm from 'htm';
import { RULES } from './rules.js';

const html = htm.bind(React.createElement);

const KEYS = [
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

export default function HelpScreen() {
  return html`
    <${Box} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX=${1}>
      <${Text} color="cyan" bold>disk-reclaim — help</${Text}>
      <${Text} dimColor=${true}>Browse a directory tree, mark space hogs into a cart, then delete them.</${Text}>

      <${Box} marginTop=${1}><${Text} color="yellow" bold>Keys</${Text}></${Box}>
      ${KEYS.map(
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
