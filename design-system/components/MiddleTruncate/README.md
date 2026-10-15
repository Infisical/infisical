# MiddleTruncate

One line of text that keeps its start and its end and drops characters from the middle to fit, for keys, paths, hosts, IDs and file names, where the end is often what tells two values apart. A utility for other components; FileTree and CodeBlock use it for names.

## You provide

- The text as `children` (a string) or `text`.
- `keepEnd`: the fewest characters to keep after the ellipsis, such as a file extension or the last path segment. By default the cut is balanced.
- `mono` for machine text, `className`, `style`. `title={false}` turns off the hover title.

## Behavior

- It is as wide as its full text until its container is narrower, then it fits the visible text to the width with a binary search, and fits again on every resize and font load. In a flex row, give it room to shrink (it sets `min-width: 0` for you); in a grid cell it fills the cell.
- When it cuts, the full text is its `title`, screen readers hear the full text, and a copy that covers only this text puts the full text on the clipboard.

## Rules

- Use it for machine values whose ends matter: `STRIPE_WEBHOOK_SECRET_PRODUCTION` against `..._STAGING`, a host, a commit or certificate ID. People's names and sentences truncate at the end instead.
- Never use it for a secret value. Values are masked, not truncated.
- Keep at least a few characters on each side; a column so narrow that only an ellipsis survives needs another layout.
