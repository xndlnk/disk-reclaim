# space-usage

A small terminal UI (TUI) for exploring disk usage by folder — a homegrown `ncdu`,
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
space-usage ~/Downloads
```

## Keys

| Key                | Action                    |
| ------------------ | ------------------------- |
| `↑` / `↓` (`k`/`j`)| Move the cursor           |
| `→` / `Enter` (`l`)| Open the selected folder  |
| `←` / `Backspace` (`h`) | Go up to the parent  |
| `g` / `G`          | Jump to top / bottom      |
| `q`                | Quit                      |

## How it works

- **`src/scan.js`** — recursively walks the tree with `fs.lstat` (symlinks are
  counted but never followed, avoiding double-counting and loops) and sums sizes
  bottom-up. Reports a live file count during the scan.
- **`src/App.js`** — the Ink UI: a scrollable, size-sorted list per folder with
  cursor navigation and a viewport that keeps the cursor on screen.
- **`src/format.js`** — human-readable byte sizes and the proportion bars.

## Possible next steps

- Speed up large scans with a `worker_threads` pool, or shell out to `du` as a fast path.
- Add on-demand deletion (with a confirm prompt) to reclaim space in place.
- Toggle apparent size vs. on-disk blocks (`stat.blocks * 512`).
- Cache scans so re-opening a large drive is instant.
