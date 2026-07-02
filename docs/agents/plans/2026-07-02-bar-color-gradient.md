---
date: 2026-07-02T11:02:25+00:00
git_commit: b72e744fc4fc57140fde3dc71e5159aeb333b035
branch: docs/largest-files-plan
topic: "Gradient-colored bar percentage"
tags: [plan, format, App]
status: draft
---

# PLAN: Gradient-colored bar percentage

Give each row's proportional bar (and its percentage) a magnitude-based color:
green when the item is a small fraction of the view total, shading through
yellow to red as it grows. This turns the currently-flat gray/yellow bar into a
quick visual heat cue for "what's big here".

## Acceptance Criteria

- Each row's `bar + percentage` segment is colored on a smooth green→yellow→red
  gradient driven by its fraction (`size ÷ view total`, the same `frac` that
  sizes the bar).
- The scale is compressed: `0%` = green, `25%` = yellow, `≥50%` = red (clamped);
  fractions above 50% stay red.
- Colors are truecolor hex, interpolated per exact percentage. On terminals
  without truecolor, Ink/chalk downsamples to the nearest supported color
  automatically (graceful degradation, no code branch needed).
- Marked items keep the gradient — the `✓` and yellow name remain the cart
  signal; there is no special bar color for marked rows.
- The previous flat gray/yellow coloring of the bar+% segment is removed.
- Behavior is identical in both the browse view and the `L`/largest view (color
  simply follows each view's `frac`).

## Technical Key Decisions and Tradeoffs

1. **New pure helper `barColor(fraction)` in `format.js`:** returns a hex color
   string (e.g. `#c9c400`).
   - Why: keeps the interpolation math out of the Ink render path and makes it
     unit-testable, mirroring the existing `bar()` / `humanSize()` helpers.
   - Impact: `App.js:175` swaps `color={isMarked ? 'yellow' : 'gray'}` for
     `color={barColor(frac)}`; one import is added.

2. **Anchor colors + compressed mapping:** green `#3fae3f` → yellow `#c9c400` →
   red `#d94a2b`; interpolate green→yellow across `frac` `0–0.25`, yellow→red
   across `0.25–0.5`, and clamp `frac ≥ 0.5` to red.
   - Why: matches the gradient preview the user selected and keeps typical
     folders visually lively (few items reach 100%, so a literal 0→1 scale would
     leave almost everything green).
   - Impact: a linear per-channel RGB lerp; pure and exactly testable at the
     anchor fractions (0, 0.25, 0.5, 1) and at the clamp boundaries.

3. **Largest view is left as-is:** in that view `frac = size ÷ whole-tree`, so
   the top files each render mostly green.
   - Why: color tracks bar fill uniformly across both views; those bars are
     already near-empty there, so green is internally consistent. No
     special-casing.
   - Impact: none — the same `barColor(frac)` call serves both views.

## Current State

The bar and percentage are rendered as a single `<Text>` per row in
`App.js:175`, colored flat gray (or yellow when marked):

```js
// App.js:169
const frac = child.size / total;   // total = current.size (browse) or root.size (largest)
...
// App.js:175
<Text color={isMarked ? 'yellow' : 'gray'}>
  {bar(frac)} {String(Math.round(frac * 100)).padStart(3)}%
</Text>
```

`bar(fraction, width = 12)` in `format.js:15` builds the fixed-width
`[#### ]` string only — it has no notion of color. The row looks like:

```
▶✓   1.2 GB [########    ]  67%  /node_modules   ← bar+% flat yellow (marked)
      340 MB [###         ]  19%  /dist           ← bar+% flat gray
       12 MB [            ]   1%   README.md       ← bar+% flat gray
             └─────┬─────┘ └┬┘
              colored as one <Text>, today gray/yellow
```

## Desired End State

The same `bar + %` segment, colored by magnitude of `frac`:

```
▶✓   1.2 GB [########    ]  67%  /node_modules   ← red   (frac ≥ 0.5, marked keeps gradient)
      340 MB [###         ]  19%  /dist           ← yellow-green
       12 MB [            ]   1%   README.md       ← green

 frac   0.00 ───────── 0.25 ───────── 0.50+   (clamped)
 color  #3fae3f      #c9c400        #d94a2b
        green         yellow          red
```

## Abstractions and Code Reuse

Reuses the existing `frac` computed in `App.js` and the `format.js` helper
pattern (small pure functions with focused unit tests). One new pure function;
no new dependencies.

- `src`
  - `format.js` — add `barColor(fraction)` helper
    - `barColor` - clamp `frac`, linear RGB lerp across green/yellow/red anchors, return `#rrggbb`
  - `App.js` — use the new helper for the bar+% color
    - import list (line 4) - add `barColor`
    - row render (line 175) - `color={barColor(frac)}` replacing `isMarked ? 'yellow' : 'gray'`
- `test`
  - `format.test.js` — add `barColor` cases
- `CLAUDE.md` — extend the `format.js` description to list `barColor`

## Logging & Observability

None — this is a presentation-only change with no logging surface.

## Implementation

Single vertical slice; no phase headers needed.

Dependencies: None.

**Tasks**:
- [x] Add `barColor(fraction)` to `src/format.js` as a pure helper returning a
  hex string. Suggested shape:
  ```js
  // Gradient anchors: green (small) → yellow → red (big).
  const GREEN = [0x3f, 0xae, 0x3f];
  const YELLOW = [0xc9, 0xc4, 0x00];
  const RED = [0xd9, 0x4a, 0x2b];

  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const toHex = (n) => n.toString(16).padStart(2, '0');

  /** Heat color for a proportional bar: green→yellow→red, red at frac >= 0.5. */
  export function barColor(fraction) {
    const p = Math.min(1, Math.max(0, fraction) / 0.5); // 0..1 across [0, 0.5]
    const [from, to, t] =
      p < 0.5 ? [GREEN, YELLOW, p / 0.5] : [YELLOW, RED, (p - 0.5) / 0.5];
    const [r, g, b] = from.map((c, i) => lerp(c, to[i], t));
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  ```
- [x] Import `barColor` in `src/App.js` (line 4, alongside `humanSize, bar, relativePath`).
- [x] Replace the bar+% color in `src/App.js:175`:
  `color={isMarked ? 'yellow' : 'gray'}` → `color={barColor(frac)}`.
  (Leave the item-name coloring on line 170/172 unchanged — marks still show a
  yellow name and `✓`.)
- [x] Add `barColor` unit tests to `test/format.test.js`:
  - `barColor(0)` returns green `#3fae3f`.
  - `barColor(0.25)` returns yellow `#c9c400` (segment boundary is exact).
  - `barColor(0.5)` returns red `#d94a2b`.
  - `barColor(1)` returns red `#d94a2b` (clamped above 0.5).
  - `barColor(-1)` returns green `#3fae3f` (clamped below 0).
  - A mid-segment value (e.g. `0.125`) is between green and yellow — assert it
    differs from both anchors and is a valid `#rrggbb` string.
- [x] Update `CLAUDE.md`: change the `format.js` line to list
  `humanSize`, `bar`, `barColor`, `relativePath`.

**Automated Verification**:
- [x] `node --test --test-name-pattern=barColor` passes.
- [x] `npm test` passes (full suite, no regressions).

**Manual Verification**:
- [ ] Run `node src/index.js .` on a folder with a mix of large and small items;
  confirm bars shade green (small) → yellow → red (large) and that items ≥50%
  of the folder are solidly red.
- [ ] Mark an item with `space`; confirm its bar keeps the gradient (not forced
  yellow) while the name and `✓` show the cart state.
- [ ] Press `L`; confirm the largest-files view renders without error (top files
  read mostly green, matching their near-empty bars).

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `src/format.js:15` — existing `bar()` helper and the display-helper pattern.
- `src/App.js:169-175` — where `frac` is computed and the bar+% is rendered.
- `test/format.test.js` — existing `bar`/`humanSize` test style to mirror.
