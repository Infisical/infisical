# FileTree

Folders and files as a tree, for repository files, secret folders and certificate bundles. It works in a framed Card with room to spare and in a Popover where space is short, as a folder picker.

## You provide

- `items`: `[{ id, name, children?, type?, icon?, meta?, disabled?, label? }]`. A node with `children` (an array, empty included) is a folder unless `type` says otherwise. `icon` replaces the default (`folder`, `folder-open` while open, `file`); use `key` for secret files such as `.env`. `meta` is muted mono text on the right ("12 keys") or a small Badge.
- `expanded` / `onExpandedChange` (folder ids), or `defaultExpanded`.
- `selected` / `onSelect(id, node)`, or `defaultSelected`. `selectable`: `all` (default), `files`, `folders` or `none`. Folders that cannot be selected open and close on click and Enter.
- `foldersOnly` hides files, for a folder picker. `size="sm"` for 28px rows (32px by default). `maxHeight` makes it scroll. `truncate="end"` swaps middle truncation for an ellipsis. `label` names the tree; `empty` for no items.

## Behavior

- An ARIA tree with one row in the tab order. Up and Down walk visible rows; Right opens a folder, then steps into it; Left closes it, then steps out to its parent; Home and End jump; Enter or Space picks; typing jumps to the next name that starts with what you typed.
- Folders open and close with AnimatedCollapse; the chevron turns over the same 200ms and the folder icon opens. A `line-soft` guide runs under each open folder's chevron, and each level indents 16px.
- Rows are connected: hover takes the row's own text color at `opacity-hover`, the selected row takes `select` with its name at 600 and a step up to `ink`. Focus draws the 2px ink outline inside the row, because rows sit inside a scroller.
- Names are mono and middle-truncate, keeping the last 8 characters of a file name.
- With `maxHeight`, the edge with more rows past it fades over 32px, like an overflowing tablist.

## Rules

- In a Card, use the flush body so rows run edge to edge. In a Popover, let the tree bleed to the popover's edges between `line-soft` rules, and say where the pick goes under it, as the preview does.
- Keep `meta` short and in one voice for the whole tree: counts or one status badge, not both.
- Open the path to the selected item by default, so people see where they are.
- Disabled folders stay visible and focusable, with a `label` that says why ("shared, read only").
