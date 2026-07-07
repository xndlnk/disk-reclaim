// Render an Ink element to plain text for assertions, without pulling in a test
// renderer dependency: mount it against a fake stdout that just accumulates the
// bytes Ink writes, then strip the ANSI escapes so only the visible text is left.
// We keep every write (not just the last frame), so a clear-on-unmount escape
// can't erase the content that was already emitted.

import { render } from 'ink';
import { Writable } from 'node:stream';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;

export function renderToText(element, { columns = 80, rows = 24 } = {}) {
  let output = '';
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      output += chunk.toString();
      cb();
    },
  });
  stdout.columns = columns;
  stdout.rows = rows;

  const instance = render(element, { stdout, patchConsole: false });
  instance.unmount();
  return output.replace(ANSI, '');
}
