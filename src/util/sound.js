// Plays the boom sound for the delete explosion by shelling out to whatever
// audio player the OS ships with. No dependencies, no native modules.
//
// Everything here fails silently: if there's no player, no audio device
// (headless/SSH/CI), or anything throws, the delete animation just runs muted.
// Sound is a cosmetic extra and must never interfere with the TUI or the delete.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BOOM = fileURLToPath(new URL('../assets/boom.wav', import.meta.url));

/** Player commands to try, in order, for the current platform. */
function candidates(file) {
  if (process.platform === 'darwin') return [['afplay', [file]]];
  if (process.platform === 'win32') {
    return [['powershell', ['-NoProfile', '-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]]];
  }
  // Linux / other: try the common players; the first one installed wins.
  return [
    ['paplay', [file]],
    ['aplay', ['-q', file]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]],
    ['play', ['-q', file]], // sox
  ];
}

/** Spawn the i-th candidate detached; on a missing binary, fall through to the next. */
function tryPlay(list, i) {
  if (i >= list.length) return;
  const [cmd, args] = list[i];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => tryPlay(list, i + 1)); // e.g. ENOENT — player not installed
    child.unref(); // don't tie the TUI's lifetime to the sound
  } catch {
    tryPlay(list, i + 1);
  }
}

/** Fire-and-forget the boom. Honors DISK_RECLAIM_SOUND=0 as a global mute. */
export function playBoom() {
  const flag = process.env.DISK_RECLAIM_SOUND;
  if (flag === '0' || flag === 'false' || flag === 'off') return;
  try {
    tryPlay(candidates(BOOM), 0);
  } catch {
    /* never let audio break a delete */
  }
}
