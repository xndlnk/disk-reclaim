import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const entry = path.join(root, 'src', 'index.js');

test('--version prints the package version and exits 0', () => {
  const result = spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.trim().includes(pkg.version), `expected ${pkg.version} in output: ${result.stdout}`);
});

test('--help prints usage and exits 0', () => {
  const result = spawnSync(process.execPath, [entry, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'), `expected "Usage:" in output: ${result.stdout}`);
  assert.ok(result.stdout.includes('--no-sound'), `expected --no-sound in output: ${result.stdout}`);
});

test('-h prints usage and exits 0', () => {
  const result = spawnSync(process.execPath, [entry, '-h'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'), `expected "Usage:" in output: ${result.stdout}`);
});
