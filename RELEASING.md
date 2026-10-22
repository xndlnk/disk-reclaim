# Releasing

How to cut a release and publish the Windows standalone build. Manual process,
driven by the [GitHub CLI](https://cli.github.com/) (`gh`).

## Steps

1. **Bump the version** in `package.json`, then commit and push:

   ```bash
   git add package.json
   git commit -m "chore: bump version to vX.Y.Z"
   git push origin main
   ```

2. **Run the tests**:

   ```bash
   npm test
   ```

3. **Build the Windows zip**, keeping the output so you can read the Node
   version it bundled:

   ```bash
   npm run build:win | tee /tmp/build-win.log
   ```

   Find the bundled Node version in the log line
   `build:win  resolved latest Node LTS … vX.Y.Z`.

4. **Create the release**, including the app version and the bundled Node
   version in the notes. `gh` creates the tag for you, pointing at the current
   `main` HEAD:

   ```bash
   gh release create vX.Y.Z dist/disk-reclaim-win-x64.zip --draft --title "vX.Y.Z" --notes "Windows standalone build (no Node install required). Bundles Node vA.B.C"
   ```

   Replace `vX.Y.Z` with the app version and `vA.B.C` with the Node version
   from step 3.

5. **Verify** the draft:

   ```bash
   gh release view vX.Y.Z --web
   ```

   Confirm the zip asset is attached and the notes look right.

6. **Publish** once verified:

   ```bash
   gh release edit vX.Y.Z --draft=false
   ```

   (Or click "Publish release" on the draft's GitHub page instead.)

## Notes

- The Node version is resolved automatically at build time (current LTS) —
  see `scripts/build-win.mjs` and the "Windows build pipeline" section of
  `CLAUDE.md`. It isn't pinned in source, so it's only knowable from the
  build's own log output, which is why step 3 captures it.
