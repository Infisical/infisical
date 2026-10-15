# FloatingActionBar

Bulk actions for what is selected, floating over the bottom of the view while anything is: the count, select all, the actions and Clear. It is a toast-like overlay (`toast-bg`, a `toast-line` border, `shadow-pop`), 48px tall, and it enters and leaves over the slide curve.

## You provide

- `count`: how many are selected. The bar shows while it is above 0 and keeps the last count while it leaves.
- `total` with `onSelectAll`: "Select all 412" while fewer are picked, for selections that reach past the page.
- `actions`: `[{ label, icon, onClick, danger?, disabled?, loading? }]` in order of importance, danger last. `moreActions` always sit in the More menu.
- `onClear` for the Clear button and Escape. `placement`: `fixed` to the viewport's bottom (default, 24px up) or `contained` in the nearest positioned ancestor (16px up).

## Overflow

The bar never wraps or clips. Labeled actions move from the end into More when they do not fit; when not even one labeled action fits, icon-only buttons with tooltips take their place if that shows more of them. Under 400px, Select all goes (the list's own header still selects the page) and the word after the count moves to screen readers only.

## Keyboard

The bar is a toolbar: Left and Right move between its buttons, Home and End jump, Escape clears the selection. A status announces the count. When the bar leaves while focus is in it, focus goes back to where it came from.

## Rules

- Only for bulk actions on a selection. A page's own actions live in its PageHeader.
- Say how many an action touches, and offer Undo after it ("Deleted 3 secrets." with Undo), rather than asking first, unless the loss is permanent.
- Keep the selection visible in the list or table behind it, with its checkboxes and `select` rows.
- A busy action shows the halftone band; keep the bar up until it finishes.
