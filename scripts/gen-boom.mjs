// Synthesizes assets/boom.wav — the explosion sound for the delete animation.
// Reproducible (seeded PRNG), no dependencies. Regenerate with:
//   node scripts/gen-boom.mjs
//
// A "boom" is a low-frequency body: a sub-bass pitch drop (the thump) plus a
// lowpass-filtered noise blast (the rumble), with a sharp initial crack, all
// under an exponential decay and soft-clipped for punch.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SR = 22050; // plenty for a low-frequency boom; keeps the file small
const DUR = 1.8;
const N = Math.floor(SR * DUR);

// mulberry32 — deterministic noise so the committed asset is reproducible.
let seed = 0x9e3779b9;
function rnd() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const buf = new Float64Array(N);
let phase = 0; // running phase for the pitch-swept sub-bass
let lp = 0; // one-pole lowpass state, turns white noise into rumble
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  // Sub-bass thump: pitch drops from ~110 Hz to ~30 Hz.
  const f = 30 + 80 * Math.exp(-t / 0.25);
  phase += (2 * Math.PI * f) / SR;
  const sub = Math.sin(phase) * Math.exp(-t / 0.5);
  // Noise blast: lowpassed white noise, loud crack up front over a longer rumble.
  lp += ((rnd() * 2 - 1) - lp) * 0.15;
  const noise = lp * (0.9 * Math.exp(-t / 0.4) + 0.7 * Math.exp(-t / 0.05));
  let x = Math.tanh((sub * 0.9 + noise * 0.85) * 1.6); // mix + soft clip
  buf[i] = x;
  peak = Math.max(peak, Math.abs(x));
}

// Normalize to -1 dBFS-ish, with a short fade in/out to avoid clicks.
const norm = 0.9 / (peak || 1);
const fadeIn = Math.floor(SR * 0.002);
const fadeOut = Math.floor(SR * 0.04);
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  let x = buf[i] * norm;
  if (i < fadeIn) x *= i / fadeIn;
  if (i > N - fadeOut) x *= (N - i) / fadeOut;
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x * 32767))), i * 2);
}

// Minimal 44-byte WAV header (PCM, 16-bit, mono).
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // fmt chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const out = fileURLToPath(new URL('../assets/boom.wav', import.meta.url));
mkdirSync(fileURLToPath(new URL('../assets', import.meta.url)), { recursive: true });
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(`wrote ${out} (${(header.length + pcm.length) / 1024} KiB, peak ${peak.toFixed(3)})`);
