import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { playBoom, boomPath } from '../src/util/sound.js';

// The boom is a cosmetic best-effort extra: a missing/broken audio player must
// never throw or crash the process, so it can never take the delete down with it.
test('boomPath: resolves to the repo-root assets/boom.wav in dev checkout and it exists', () => {
  const p = boomPath();
  assert.ok(p.endsWith('boom.wav'), `path should end with boom.wav, got: ${p}`);
  assert.ok(existsSync(p), `boom.wav should exist at resolved path: ${p}`);
});

test('playBoom: never throws or crashes when no audio player is available', async () => {
  const savedPath = process.env.PATH;
  const savedFlag = process.env.DISK_RECLAIM_SOUND;
  process.env.PATH = ''; // force every candidate player to ENOENT
  delete process.env.DISK_RECLAIM_SOUND; // exercise the spawn path, not the mute short-circuit

  let escaped = null;
  const onErr = (e) => {
    escaped = e;
  };
  process.on('uncaughtException', onErr);
  process.on('unhandledRejection', onErr);
  try {
    assert.doesNotThrow(() => playBoom());
    await new Promise((r) => setTimeout(r, 200)); // let the async spawn 'error' events fire
    assert.equal(escaped, null, escaped && escaped.message);
  } finally {
    process.off('uncaughtException', onErr);
    process.off('unhandledRejection', onErr);
    process.env.PATH = savedPath;
    if (savedFlag === undefined) delete process.env.DISK_RECLAIM_SOUND;
    else process.env.DISK_RECLAIM_SOUND = savedFlag;
  }
});

test('playBoom: DISK_RECLAIM_SOUND=0 mutes it (returns without spawning)', () => {
  const saved = process.env.DISK_RECLAIM_SOUND;
  process.env.DISK_RECLAIM_SOUND = '0';
  try {
    assert.doesNotThrow(() => playBoom());
  } finally {
    if (saved === undefined) delete process.env.DISK_RECLAIM_SOUND;
    else process.env.DISK_RECLAIM_SOUND = saved;
  }
});
