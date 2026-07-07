// A procedural atomic mushroom-cloud explosion, rendered as ASCII that scales to
// whatever terminal size we're in. Purely cosmetic — it plays when a destructive
// delete fires (see the `'exploding'`/`'boom-done'` modes in App.js).
//
// The cloud rises over the animated steps (0 .. BOOM_STEPS-2): a ground fireball
// climbs, trailing a stem, and billows into a cap. The final step (BOOM_STEPS-1)
// is the settled smoke we freeze on to show the summary.

export const BOOM_STEPS = 10;

/** Deterministic value noise in [0,1) — cloud texture without Math.random (stable frames). */
function noise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Glyph for a coverage margin (0 at a region's edge → 1 deep inside), eroded at the rim. */
function cloudChar(m, x, y) {
  if (m <= 0) return ' ';
  const n = noise(x * 1.7, y * 2.3);
  if (m < 0.16) return n > 0.55 ? ' ' : n > 0.3 ? '.' : ':'; // ragged edge
  if (m < 0.4) return n > 0.5 ? '*' : ':';
  if (m < 0.7) return n > 0.5 ? '#' : '*';
  return n > 0.5 ? '@' : '#'; // dense core
}

/** Row color: white flash → hot fireball core → cooling cap / smoke. */
function rowColor(y, capY, p, step, last) {
  if (!last && step <= 0) return 'whiteBright'; // detonation flash
  if (last) return y < capY - 1 ? 'white' : 'gray'; // settled smoke
  const d = y - capY;
  if (d >= -1 && d <= 2) return p < 0.5 ? 'yellowBright' : 'yellow'; // fireball core
  if (d < -1) return p > 0.75 ? 'gray' : 'red'; // cooling cap above the core
  return p > 0.75 ? 'red' : 'yellow'; // stem + ground dust below
}

/**
 * Build one frame. Returns { lines, colors }: `lines[y]` is a `cols`-wide string,
 * `colors[y]` the Ink color for that whole row.
 */
export function boomGrid(cols, rows, step, last) {
  const W = cols;
  const H = rows;
  const cx = (W - 1) / 2;
  const groundY = H - 1;
  const p = last ? 1 : clamp((step + 1) / (BOOM_STEPS - 1), 0, 1);

  // Cap grows and climbs from the ground toward the top as the blast progresses.
  const capRy = clamp(H * 0.15, 2, H) * Math.min(1, p * 1.5);
  const capRx = W * 0.3 * Math.min(1, p * 1.5);
  const topY = groundY - p * (groundY - 1);
  const capY = topY + capRy; // cap ellipse center
  const stemBaseW = Math.max(1.2, W * 0.045);
  const baseRx = W * 0.18 + W * 0.3 * p;
  const baseRy = Math.max(1.5, H * 0.07);

  const lines = [];
  const colors = [];
  for (let y = 0; y < H; y++) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const dx = x - cx;

      // Mushroom cap: an ellipse, widened into a brim near its underside.
      const brim = y >= capY - 0.5 && y <= capY + capRy * 0.6 ? 1.25 : 1;
      const capM = 1 - (dx / (capRx * brim)) ** 2 - ((y - capY) / capRy) ** 2;

      // Stem: a column from the cap down to the ground, flaring at the base.
      let stemM = -1;
      if (y >= capY && y <= groundY) {
        const f = (y - capY) / Math.max(1, groundY - capY); // 0 at cap → 1 at ground
        const halfW = stemBaseW * (0.8 + 1.6 * f * f);
        stemM = 1 - Math.abs(dx) / halfW;
      }

      // Base: a dust cloud spreading along the ground.
      const baseM = 1 - (dx / baseRx) ** 2 - ((y - groundY) / baseRy) ** 2;

      line += cloudChar(Math.max(capM, stemM, baseM), x, y);
    }
    lines.push(line);
    colors.push(rowColor(y, capY, p, step, last));
  }
  return { lines, colors };
}
