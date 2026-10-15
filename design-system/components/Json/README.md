# Json

A JSON value pretty-printed as a tree whose objects and arrays open and close, for audit events, webhook payloads, API responses and metadata. On its own it is bare; inside a CodeBlock it gets the header and Copy.

## You provide

- `value`: any JSON value, or a JSON string (invalid JSON shows as plain code).
- `defaultExpandDepth`: how many levels start open (default 2). Pass a large number to open everything. To expand or collapse all from a header action, change it and remount with a `key`, as the preview does.
- `redact`: key names (case-insensitive) or a function of the key. Their values show as `"••••••••"` and copy as `"<redacted>"`.
- `wrap` to wrap long strings, `maxLines` or `maxHeight`, `label` (its accessible name).

## Behavior

- Keys are `ink` at 600, strings `text2`, numbers, booleans and null `ink` at 500, punctuation `muted`, the same neutral highlighting as Code.
- Each object or array has a chevron toggle (`aria-expanded`); clicking its line toggles it too. A closed node shows `{ … }` with a muted count ("3 keys", "2 items").
- Nodes open and close with AnimatedCollapse, and a `line-soft` guide runs down each open level, 16px per level.

## Rules

- Redact every secret value, token and credential before it reaches the screen. Redaction also applies when a CodeBlock copies it.
- Open two levels by default; deep payloads start closed so the shape shows first.
- For raw text that is not JSON, use Code.
