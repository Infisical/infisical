# Popover

A small task that keeps its context: change a rotation schedule, pick a scope, confirm a reference. Anything longer becomes a Dialog or a Sheet.

## You provide

- `trigger`: a Button element; it gets `aria-expanded` and focus returns to it on close.
- `title` and optional `description`, then `children`. Pass a function as children to receive `{ close }`.
- `open` / `onOpenChange` or `defaultOpen`; `align="end"`; `side="top"`; `width` (default 280).

## Rules

- One decision per popover, with its own Save.
- Escape and a click outside close it without saving.
