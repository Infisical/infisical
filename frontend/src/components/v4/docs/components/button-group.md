# ButtonGroup

> **v4 status:** Primitive installed: [`ui/button-group.tsx`](../../ui/button-group.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

Keeps related actions together: attached for one object's tools, split for a main action with alternatives, a toolbar for icon buttons, and spaced buttons for footers.

## Parts

- `ButtonGroup variant="attached"` (default): buttons share borders. For two to four actions on the same object ("Copy", "Reveal", "History").
- Split button: an attached group of a primary Button and a DropdownMenu whose trigger is an icon-only Button with `chev-down`.
- `ButtonGroup variant="toolbar"`: ghost icon buttons 2px apart, grouped with vertical Separators. Give it a `label`.
- `ButtonGroup variant="spaced"`: 12px apart, for footers ("Cancel", "Save changes").
- Picking one view of the same data is not a ButtonGroup: use Tabs `variant="segmented"`. It replaced ToggleGroup, which still renders one for older pages.

## Rules

- Put the safe action first and the primary last in footers.
- Never mix variants inside one attached group except the split pattern.
