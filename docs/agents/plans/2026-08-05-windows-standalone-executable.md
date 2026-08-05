---
date: 2026-08-05T17:53:14+00:00
git_commit: 44c611bcaca70444c74d2fa91e5eada5a33b0aac
branch: main
topic: "Windows standalone executable (no Node install)"
tags: [plan, packaging, windows, sound, build]
status: draft
---

# PLAN: Ship disk-reclaim as a standalone Windows download

Make disk-reclaim runnable on Windows by double-clicking / dragging or from a
terminal, **without the user installing Node.js or any npm dependencies**. The
deliverable is a single `disk-reclaim-win-x64.zip` the user unzips and runs.

The build runs locally on the maintainer's macOS machine (`npm run build:win`)
and cross-produces the Windows artifact. Verification of the actual `.exe`
behavior is a manual pass on a real Windows machine.

## Acceptance Criteria

- A single `npm run build:win` on macOS produces
  `dist/disk-reclaim-win-x64.zip` containing `node.exe`, `app.mjs`, `boom.wav`,
  and `disk-reclaim.cmd`.
- On Windows, unzipping and running `disk-reclaim.cmd <path>` (or dragging a
  folder onto `disk-reclaim.cmd`) launches the working TUI with **no Node
  install** required.
- The delete-boom sound plays from the packaged build (wav found next to the
  binary) **and** is fixed for dev source runs (currently broken — see Current
  State).
- `node src/index.js --version` (and the packaged equivalent) prints the version
  and exits 0; `--help` prints usage and exits 0.
- `npm test` stays green; existing `node src/index.js` interactive behavior is
  unchanged.

## Technical Key Decisions and Tradeoffs

1. **Packager: esbuild → single ESM `app.mjs` shipped beside a real `node.exe`,
   zipped.** *(Not Node SEA, not pkg.)*
   - Why: Ink's layout engine `yoga-layout@3.2` does a **top-level `await`** at
     import time (`const Yoga = wrapAssembly(await loadYoga())`). Top-level await
     cannot be expressed in a single CommonJS file, and **both Node SEA and pkg
     require a CJS blob**. ESM output supports TLA; shipping a real `node.exe`
     keeps runtime behavior byte-for-byte identical to `node src/index.js`.
   - Impact: The distribution is a small multi-file zip (node.exe + bundle +
     launcher + wav), not a lone `.exe`. Proven end-to-end during planning
     (bundle runs under Node and renders the TUI).

2. **Bundle knobs: devtools stub alias + `createRequire` banner + defines.**
   - Why: esbuild fails to resolve Ink's dev-only `react-devtools-core` import
     (`--external` leaves it dangling at runtime). CJS dependencies call
     `require()` for Node builtins, which ESM output cannot do without a shim.
   - Impact: The build aliases `react-devtools-core` → an empty stub module,
     injects `import{createRequire}from'module';const require=createRequire(import.meta.url);`
     as a banner, and defines `process.env.NODE_ENV="production"` /
     `process.env.DEV="false"`. All three were proven necessary and sufficient.

3. **Sound: resolve `boom.wav` via an ordered candidate list.**
   - Why: The wav is loaded through `import.meta.url`, which points into the
     bundle at runtime; after the `src/` refactor the dev path is also broken
     (resolves to non-existent `src/assets/boom.wav`).
   - Impact: `sound.js` picks the first existing candidate among (a) next to
     `process.execPath`, (b) next to the module, (c) the dev `assets/` path.
     Works packaged and in dev; failure stays silent (sound is cosmetic).

4. **Target: win-x64 only, pinned Node 22 LTS `node.exe`, fetched directly.**
   - Why: win-arm64 is rare; a pinned LTS is the conventional choice for a
     distributable. nodejs.org serves a bare `win-x64/node.exe` (HTTP 200
     confirmed), so no unzip step is needed.
   - Impact: One pinned URL in the build script; the download is cached so
     rebuilds are offline-friendly.

5. **No top-level-await refactor of `index.js`.**
   - Why: ESM output supports TLA, so the existing top-level `await scan(...)`
     stays as-is.
   - Impact: Only additive change to `index.js` is early-exit `--version` /
     `--help` handling (also serves as a deterministic, TTY-independent smoke
     check).

## Current State

Pure Node ESM + Ink TUI, no native modules. `yoga-layout` ships as pure JS
(no `.wasm` sidecar), so the whole app bundles to one JS file — but only in ESM
because of the top-level await.

```
disk-reclaim/
├── src/index.js          #!/usr/bin/env node — TLA: `await scan()` then render <App/>
│                         args: `--no-sound`, first non-dash arg = target path
├── src/ui/*.js           Ink (React) components
├── src/core/*.js         fs walk + logic (node:fs, node:path only)
├── src/util/sound.js     shells out (afplay/paplay/…/powershell); BOOM path via import.meta.url
└── assets/boom.wav       the one runtime asset (repo root)

Run today: `node src/index.js [path]`  → needs Node + `npm install`
```

Two facts uncovered during planning that drive this plan:

- **CJS bundling is impossible.** `esbuild --format=cjs` fails with
  `Top-level await is currently not supported with the "cjs" output format`
  pointing at `yoga-layout/dist/src/index.js`. ESM output (`--format=esm`) with
  a devtools alias stub + `createRequire` banner builds a 642 KB `app.mjs` that
  runs under Node and renders the TUI.
- **Sound is already broken in dev.** `src/util/sound.js` line 11 resolves
  `new URL('../assets/boom.wav', import.meta.url)` →
  `src/assets/boom.wav`, which does not exist (the file is repo-root
  `assets/boom.wav` = `../../assets/...`). It fails silently, so it went
  unnoticed after the `ui/ core/ util/` refactor.

## Desired End State

```
maintainer (macOS):  npm run build:win
   │
   ├─ esbuild  src/index.js ──► dist/app.mjs        (ESM, ~642 KB, no node_modules)
   │            (alias stub + createRequire banner + defines)
   ├─ fetch    nodejs.org/.../win-x64/node.exe  (Node 22 LTS, cached) ─► dist/node.exe
   ├─ copy     assets/boom.wav ─► dist/boom.wav
   ├─ write    dist/disk-reclaim.cmd   (@ "%~dp0node.exe" "%~dp0app.mjs" %*)
   ├─ write    dist/README.txt
   └─ zip      ─► dist/disk-reclaim-win-x64.zip

end user (Windows, no Node):
   unzip → run `disk-reclaim.cmd C:\path`  OR  drag a folder onto disk-reclaim.cmd
        → real node.exe runs app.mjs → working TUI; delete-boom plays boom.wav
```

Zip contents:

```
disk-reclaim-win-x64.zip
├─ node.exe            (~90 MB, official Node 22 win-x64)
├─ app.mjs             (~642 KB esbuild ESM bundle)
├─ boom.wav
├─ disk-reclaim.cmd    → "%~dp0node.exe" "%~dp0app.mjs" %*
└─ README.txt
```

## Abstractions and Code Reuse

Reuses the existing arg handling in `index.js` (first non-dash arg = target)
and the existing silent-failure design of `sound.js` (a wrong/missing wav path
must never break the delete). New: one build script and a tiny stub module.

- `src/`
  - `index.js` — add early-exit `--version` / `--help` before the loading
    screen; read version from `package.json`.
  - `util/sound.js`
    - `boomPath()` — new testable helper returning the first existing wav
      candidate (execPath dir → module dir → dev `assets/`); replaces the
      module-level `BOOM` constant.
- `scripts/`
  - `build-win.mjs` — new. esbuild build + node.exe fetch/cache + assemble + zip.
  - `stub-devtools.js` — new. `export default {};` — alias target for
    `react-devtools-core`.
- `test/`
  - `sound.test.js` — new. Unit-tests `boomPath()` resolution.
  - `cli.test.js` — new. Spawns `node src/index.js --version` / `--help`.
- Root
  - `package.json` — add `build:win` script + `esbuild` devDependency.
  - `.gitignore` — add `dist/` and the node.exe download cache.
  - `README.md`, `CLAUDE.md` — docs.

## Logging & Observability

No runtime logging changes. The build script prints a concise progress log
(each stage + final artifact path and size), e.g.:

```
build:win  bundling src/index.js → dist/app.mjs … 642 KB
build:win  node.exe (v22.13.0 win-x64) … cached
build:win  assembling dist/ (app.mjs, node.exe, boom.wav, disk-reclaim.cmd, README.txt)
build:win  → dist/disk-reclaim-win-x64.zip (91.4 MB)
```

## Implementation

### Phase 1: App source prep (sound path fix + version/help flags)

Dependencies: None

Make the app packaging-ready with changes that are fully testable from source,
independent of any build tooling. Also fixes the pre-existing broken boom path.

**Tasks**:
- [ ] In `src/util/sound.js`, replace the module-level `BOOM` constant with a
  `boomPath()` helper that returns the first existing candidate, or the last
  candidate if none exist (so `spawn` still fails silently):
  ```js
  import { existsSync } from 'node:fs';
  import path from 'node:path';
  function boomPath() {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const candidates = [
      path.join(path.dirname(process.execPath), 'boom.wav'), // packaged: next to node.exe/app.mjs
      path.join(here, 'boom.wav'),                            // packaged: next to the bundle
      path.join(here, '..', '..', 'assets', 'boom.wav'),      // dev: repo-root assets/
    ];
    return candidates.find(existsSync) ?? candidates[candidates.length - 1];
  }
  ```
  Call `candidates(boomPath())` inside `playBoom()` (resolve lazily at play
  time, not import time).
- [ ] In `src/index.js`, before rendering the loading screen, handle
  `--version` (print the version, exit 0) and `--help`/`-h` (print a short usage
  block listing the path arg, `--no-sound`, `--version`, `--help`; exit 0).
  Get the version via a **static JSON import so esbuild inlines it into the
  bundle** — `import pkg from '../package.json' with { type: 'json' }` — do
  **not** read `package.json` at runtime (`createRequire('../package.json')`
  would throw in the packaged build, which ships no `package.json`).
- [ ] Add `test/sound.test.js`: import `boomPath` (export it) and assert that in
  the dev checkout it resolves to the repo-root `assets/boom.wav` and that the
  returned path exists.
- [ ] Add `test/cli.test.js`: spawn `node src/index.js --version` and assert the
  output matches the `package.json` version and exit code 0; spawn `--help` and
  assert it prints usage and exits 0.

**Automated Verification**:
- [ ] `npm test` passes (including the two new test files).
- [ ] `node src/index.js --version` prints the version and exits 0.
- [ ] `node src/index.js --help` prints usage and exits 0.
- [ ] `node -e "import('./src/util/sound.js').then(m=>{if(!require('fs').existsSync(m.boomPath()))process.exit(1)})"` — the resolved dev wav path exists.

**Manual Verification**:
- [ ] `node src/index.js` still launches the interactive TUI and a delete now
  actually plays the boom sound (previously silent due to the broken path).

### Phase 2: Windows build pipeline

Dependencies: Phase 1

Deliver the actual artifact: a repeatable `npm run build:win` that bundles,
fetches Node, assembles `dist/`, and zips it.

**Tasks**:
- [ ] Add `esbuild` to `devDependencies` and a `"build:win": "node scripts/build-win.mjs"`
  script in `package.json`.
- [ ] Add `scripts/stub-devtools.js` containing `export default {};`.
- [ ] Add `scripts/build-win.mjs` that:
  - Bundles with esbuild (programmatic API) —
    `format: 'esm'`, `platform: 'node'`, `target: 'node22'`,
    `bundle: true`, `outfile: 'dist/app.mjs'`,
    `alias: { 'react-devtools-core': './scripts/stub-devtools.js' }`,
    `banner: { js: "import{createRequire as ___cr}from'module';const require=___cr(import.meta.url);" }`,
    `define: { 'process.env.NODE_ENV': '"production"', 'process.env.DEV': '"false"' }`.
  - Downloads the pinned Node (`const NODE = 'v22.13.0'`) from
    `https://nodejs.org/dist/${NODE}/win-x64/node.exe` via `fetch`, caching to
    `.cache/node-${NODE}-win-x64.exe`; copies it to `dist/node.exe`.
  - Copies `assets/boom.wav` → `dist/boom.wav`.
  - Writes `dist/disk-reclaim.cmd`:
    `@echo off` + `"%~dp0node.exe" "%~dp0app.mjs" %*`.
  - Writes `dist/README.txt` (how to run: terminal or drag-a-folder; keep the
    files together; win-x64 only).
  - Zips the four+README files into `dist/disk-reclaim-win-x64.zip`
    (shell out to the system `zip`, run from inside `dist/` so paths are flat;
    document `zip` as a build-time requirement).
  - Prints the progress log from *Logging & Observability*.
- [ ] Add `dist/` and `.cache/` to `.gitignore`.

**Automated Verification**:
- [ ] `npm run build:win` exits 0 and creates
  `dist/disk-reclaim-win-x64.zip`, `dist/app.mjs`, `dist/node.exe`,
  `dist/boom.wav`, `dist/disk-reclaim.cmd`.
- [ ] `unzip -l dist/disk-reclaim-win-x64.zip` lists exactly `node.exe`,
  `app.mjs`, `boom.wav`, `disk-reclaim.cmd`, `README.txt` at the archive root.
- [ ] `node dist/app.mjs --version` prints the version and exits 0 (bundle is
  valid and self-contained — no `node_modules` present in `dist/`).
- [ ] `node dist/app.mjs /tmp` boots and renders without crashing when piped
  (non-TTY), confirming Ink initializes from the bundle.

**Manual Verification** (on a real Windows machine, no Node installed):
- [ ] Unzip `disk-reclaim-win-x64.zip`; run `disk-reclaim.cmd --version` in a
  terminal — prints the version.
- [ ] Run `disk-reclaim.cmd C:\some\folder` — the TUI scans and renders; arrow
  keys / `j`/`k` move, `→`/`Enter` open, `←` go up (raw-mode keyboard input
  works).
- [ ] Drag a folder from Explorer onto `disk-reclaim.cmd` — it scans that folder.
- [ ] Mark an item and delete it (`d`, `y`) — the explosion animation plays and
  the **boom sound** plays (wav found next to the exe); sizes update.
- [ ] `q` quits cleanly and the console returns to normal.

### Phase 3: Documentation

Dependencies: Phase 2

Tell users how to download/run it and record the build for future maintainers.

**Tasks**:
- [ ] `README.md`: add a **"Download for Windows (no Node install)"** section —
  grab `disk-reclaim-win-x64.zip` from Releases, unzip, run `disk-reclaim.cmd
  <path>` in a terminal or drag a folder onto it. Note: win-x64 only; keep all
  files together (don't move `disk-reclaim.cmd`/`node.exe`/`boom.wav`/`app.mjs`
  apart); the bundled `node.exe` is Microsoft-signed so SmartScreen is usually
  quiet, but if a warning appears choose *More info → Run anyway*. Reconcile
  with the existing "Compatibility" section.
- [ ] `README.md`: add a short **"Building the Windows zip"** maintainer note
  (`npm run build:win`, requires the `zip` CLI, output in `dist/`).
- [ ] `CLAUDE.md`: document under Commands/Architecture — the `build:win`
  pipeline, **why SEA/pkg were rejected** (yoga-layout top-level await → no CJS
  blob), the devtools stub + `createRequire` banner, the `boomPath()` candidate
  resolution, and the `dist/` layout. Note `dist/`+`.cache/` are gitignored.

**Automated Verification**:
- [ ] `README.md` contains a "Download for Windows" heading and the
  `disk-reclaim.cmd` usage line.
- [ ] `CLAUDE.md` mentions `build:win` and `scripts/build-win.mjs`.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Planning proved the pipeline empirically: `esbuild --format=cjs` fails on
  `yoga-layout` TLA; the ESM bundle with devtools alias + `createRequire` banner
  runs under Node and renders the TUI. Node SEA and pkg were ruled out for the
  same TLA/CJS reason. Bun `--compile` also works (single 99 MB exe) but swaps
  the runtime to Bun and left Windows raw-mode input unverified — kept as a
  documented fallback, not the chosen path.

## References

- `src/util/sound.js:11` — the broken `../assets/boom.wav` path fixed here.
- `src/index.js:11-13,38-48` — arg parsing + top-level `await scan()` + render.
- Node SEA docs (single executable apps) — rejected due to CJS-only main.
- esbuild ESM output caveats — `createRequire` banner for CJS deps'
  `require()`; `alias`/`define` for the devtools stub and dead-code paths.
</content>
</invoke>
