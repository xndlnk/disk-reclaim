#!/usr/bin/env node
// Build script: produces dist/disk-reclaim-win-x64.zip
// Requires: esbuild (npm devDependency), zip CLI (homebrew: brew install zip)

import * as esbuild from 'esbuild';
import { createWriteStream, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = path.join(root, 'dist');
const cache = path.join(root, '.cache');

const NODE_VERSION = 'v22.13.0';
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`;
const NODE_CACHE = path.join(cache, `node-${NODE_VERSION}-win-x64.exe`);

function log(msg) {
  console.log(`build:win  ${msg}`);
}

function humanSize(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

// --- Step 1: Bundle ---
log(`bundling src/index.js → dist/app.mjs …`);
mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: path.join(dist, 'app.mjs'),
  alias: {
    'react-devtools-core': path.join(root, 'scripts', 'stub-devtools.js'),
  },
  banner: {
    js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);",
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.DEV': '"false"',
  },
});

const bundleSize = (await stat(path.join(dist, 'app.mjs'))).size;
log(`bundling src/index.js → dist/app.mjs … ${humanSize(bundleSize)}`);

// --- Step 2: node.exe (cached) ---
mkdirSync(cache, { recursive: true });

if (existsSync(NODE_CACHE)) {
  log(`node.exe (${NODE_VERSION} win-x64) … cached`);
} else {
  log(`node.exe (${NODE_VERSION} win-x64) … downloading`);
  const res = await fetch(NODE_URL);
  if (!res.ok) throw new Error(`Failed to download node.exe: ${res.status} ${res.statusText}`);
  await pipeline(res.body, createWriteStream(NODE_CACHE));
  const size = (await stat(NODE_CACHE)).size;
  log(`node.exe (${NODE_VERSION} win-x64) … ${humanSize(size)}`);
}

copyFileSync(NODE_CACHE, path.join(dist, 'node.exe'));

// --- Step 3: Assemble dist/ ---
log(`assembling dist/ (app.mjs, node.exe, boom.wav, disk-reclaim.cmd, README.txt)`);

copyFileSync(path.join(root, 'assets', 'boom.wav'), path.join(dist, 'boom.wav'));

writeFileSync(
  path.join(dist, 'disk-reclaim.cmd'),
  '@echo off\r\n"%~dp0node.exe" "%~dp0app.mjs" %*\r\n',
);

writeFileSync(
  path.join(dist, 'README.txt'),
  [
    'disk-reclaim — Windows (x64)',
    '============================',
    '',
    'Usage (drag-and-drop):',
    '  Drag a folder from Explorer onto disk-reclaim.cmd',
    '',
    'Usage (terminal):',
    '  disk-reclaim.cmd C:\\path\\to\\folder',
    '',
    'Keep all files together (node.exe, app.mjs, boom.wav, disk-reclaim.cmd).',
    'No Node.js install required — node.exe is bundled.',
    '',
    'Windows version: x64 only.',
    '',
    'If SmartScreen warns on node.exe, choose More info → Run anyway.',
    '(node.exe is the official Microsoft-signed Node.js binary.)',
  ].join('\r\n') + '\r\n',
);

// --- Step 4: Zip ---
const zipName = 'disk-reclaim-win-x64.zip';
const zipPath = path.join(dist, zipName);

const files = ['node.exe', 'app.mjs', 'boom.wav', 'disk-reclaim.cmd', 'README.txt'];

// Prefer the system `zip` CLI; fall back to Python's zipfile (available on macOS/Linux by default).
const hasZip = !spawnSync('zip', ['--version'], { stdio: 'ignore' }).error;
if (hasZip) {
  const result = spawnSync('zip', [zipPath, ...files], { cwd: dist, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`zip exited with status ${result.status}`);
} else {
  const py = `
import zipfile, os, sys
dist, zippath, *files = sys.argv[1:]
with zipfile.ZipFile(zippath, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(dist, f), f)
`;
  const result = spawnSync('python3', ['-c', py, dist, zipPath, ...files], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`python3 zip fallback exited with status ${result.status}`);
}

const zipSize = (await stat(zipPath)).size;
log(`→ dist/${zipName} (${humanSize(zipSize)})`);
