# disk-reclaim

A small terminal UI (TUI) for exploring disk usage by folder and reclaiming space — a homegrown `ncdu`,
built with Node.js + [Ink](https://github.com/vadimdemedes/ink).

Scan a directory tree, then walk it interactively. Each folder shows its children
sorted largest-first, with a proportional bar and percentage, so the space hogs
jump straight to the top. The bars are color-coded by absolute size — red for
large items, yellow for medium, gray for small — so the heavy hitters stand out at
a glance. Or press `l` for a flat "largest files" view that surfaces the biggest
files anywhere in the tree without hunting folder by folder.

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

## Compatibility

Runs on **macOS, Linux, and Windows** — it uses only portable Node core APIs
(`node:fs`, `node:path`) and Ink, with no shell-outs or POSIX-only assumptions.
Requires Node 18+ (for top-level `await` and `fs.rm`).

A couple of Windows notes:

- Use a modern terminal (**Windows Terminal** or **PowerShell 7**) for the box
  borders, colors, and inverse-video cursor to render correctly; the legacy
  `cmd.exe` console can look rough.
- The scan skips symlinks but **descends into directory junctions**, since Node's
  `isSymbolicLink()` doesn't flag them. This is rare in practice but can affect
  totals if a junction points back into the scanned tree.

## Keys

| Key                | Action                             |
| ------------------ | ---------------------------------- |
| `↑` / `↓` (`k`/`j`)| Move the cursor                    |
| `→` / `Enter`      | Open the selected folder           |
| `←` / `Backspace` | Go up to the parent                |
| `g` / `G`          | Jump to top / bottom               |
| `Space` (`m`)      | Mark/unmark the item for reclaiming |
| `r`                | Apply rules — auto-mark reclaimable folders |
| `l`                | Toggle the largest-files view (top files across the whole tree) |
| `d`                | Delete the reclaim cart (asks to confirm) |
| `c`                | Clear all marks                    |
| `?` / `h`          | Show the help page                 |
| `q`                | Quit                               |

In the largest-files view, `←` / `Backspace` (or `l` again) returns you to browsing
at the folder and cursor you left; `→` / `Enter` do nothing there since there's
nothing to open.

## Reclaiming space

Mark any file or folder with `Space`; it drops into the **reclaim cart** on the
right, which shows a running total of how much space you'd free. Each cart item is
labelled with its path relative to the scanned root, so same-named folders in
different places (e.g. two nested `node_modules`) stay distinguishable. Marks
persist as you navigate, so you can gather targets from all over the tree.
Overlapping marks (a file inside an already-marked folder) are counted once.

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

### Finding the largest files

Browsing folder by folder is great for structure, but a single giant file buried
deep in the tree can hide from you. Press `l` to switch to the **largest-files
view**: a flat list of the top 50 files anywhere under the scanned root, sorted
largest-first, each labelled with its path relative to the root. The header notes
how many files were scanned in total (e.g. "largest 50 files (of 12,904 files)").
You can mark, apply rules, and delete from this view just like when browsing —
press `l` again (or `←`) to return exactly where you left off.

## How it works

- **`src/scan.js`** — recursively walks the tree with `fs.lstat` (symlinks are
  counted but never followed, avoiding double-counting and loops) and sums sizes
  bottom-up. Reports a live file count during the scan.
- **`src/App.js`** — the Ink UI: a scrollable, size-sorted list per folder with
  cursor navigation and a viewport that keeps the cursor on screen.
- **`src/rules.js`** — the rule registry and `findMatches` walker behind the `r`
  auto-mark command.
- **`src/largest.js`** — the whole-tree walk (`largestFiles`, `countFiles`) that
  backs the `l` largest-files view.
- **`src/format.js`** — human-readable byte sizes, the proportion bars, and
  `barColor`, which maps a size to red / yellow / gray heat thresholds.

## Possible next steps

- Speed up large scans with a `worker_threads` pool, or shell out to `du` as a fast path.
- Let rules be toggled or configured (e.g. a picker, or a config file) instead of applying all at once.
- Toggle apparent size vs. on-disk blocks (`stat.blocks * 512`).
- Cache scans so re-opening a large drive is instant.
