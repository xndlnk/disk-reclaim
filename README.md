# disk-reclaim

A small terminal UI (TUI) for exploring disk usage by folder and reclaiming space — a homegrown `ncdu`,
built with Node.js + [Ink](https://github.com/vadimdemedes/ink).

Scan a directory tree, then walk it interactively. Each folder shows its children
sorted largest-first, with a proportional bar and percentage, so the space hogs
jump straight to the top.

## Usage

```bash
npm install
node src/index.js [path]     # defaults to the current directory
```

Or link it as a global command:

```bash
npm link
disk-reclaim ~/Downloads
```

## Keys

| Key                | Action                             |
| ------------------ | ---------------------------------- |
| `↑` / `↓` (`k`/`j`)| Move the cursor                    |
| `→` / `Enter` (`l`)| Open the selected folder           |
| `←` / `Backspace` (`h`) | Go up to the parent           |
| `g` / `G`          | Jump to top / bottom               |
| `Space` (`m`)      | Mark/unmark the item for reclaiming |
| `r`                | Apply rules — auto-mark reclaimable folders |
| `d`                | Delete the reclaim cart (asks to confirm) |
| `c`                | Clear all marks                    |
| `q`                | Quit                               |

## Reclaiming space

Mark any file or folder with `Space`; it drops into the **reclaim cart** on the
right, which shows a running total of how much space you'd free. Marks persist as
you navigate, so you can gather targets from all over the tree. Overlapping marks
(a file inside an already-marked folder) are counted once.

Press `d` to delete everything in the cart. A confirmation prompt appears in the
footer — only `y` proceeds; anything else cancels. Deletion never throws on a
single failure: whatever couldn't be removed stays marked and is reported, and the
tree's sizes update in place so you see the space you reclaimed immediately.

### Auto-marking with rules

Press `r` to scan the whole tree for well-known regenerable directories and drop
them all into the cart at once — no hunting required. The built-in rules match
`node_modules`, `dist`, `build`, `.next`, `target`, `__pycache__`, and `.gradle`.
Matches merge into any marks you already have, and a matched folder isn't searched
any deeper, so nested copies don't pile up. Review the cart and press `d` when
you're ready. Rules live in `src/rules.js` as an extensible `RULES` registry —
add a `{ id, label, match(node) }` entry to teach it a new pattern.

## How it works

- **`src/scan.js`** — recursively walks the tree with `fs.lstat` (symlinks are
  counted but never followed, avoiding double-counting and loops) and sums sizes
  bottom-up. Reports a live file count during the scan.
- **`src/App.js`** — the Ink UI: a scrollable, size-sorted list per folder with
  cursor navigation and a viewport that keeps the cursor on screen.
- **`src/rules.js`** — the rule registry and `findMatches` walker behind the `r`
  auto-mark command.
- **`src/format.js`** — human-readable byte sizes and the proportion bars.

## Possible next steps

- Speed up large scans with a `worker_threads` pool, or shell out to `du` as a fast path.
- Let rules be toggled or configured (e.g. a picker, or a config file) instead of applying all at once.
- Toggle apparent size vs. on-disk blocks (`stat.blocks * 512`).
- Cache scans so re-opening a large drive is instant.
