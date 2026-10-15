# List

Gives a set of Items their behavior: the box, the row size, what a row does when clicked, which rows are current or selected, and the loading, empty and footer rows. The rows are Items; List decides how they act, the way Table does for its rows.

## You provide

- `children`: Items, and `ListSection`s (`label`, `meta`) holding Items.
- `variant`: `framed` (default, the tint shell around an inset surface), `plain` (a bordered surface) or `bare` (no box, for card bodies and popovers).
- `size`: `md` (default, 13px by 16px around a 40px lead) or `sm` (40px rows, 14px sides, one line each).
- `actionsPlacement`: `end` (default) or `below`. With `below`, every md row's actions take their own row under the text, so times line up at the end of every first line and actions start at the text's left edge in every row, at any width. Use it for queues whose buttons change with each row's state, recovery actions included (Undo, Revoke, Retry).
- `title` and `action` (framed only): an eyebrow and a link or count inside the shell, like a framed Card. `label` names the list for screen readers when there is no title.
- `selection="multiple"` with `selectedIds` / `onSelectionChange` (or `defaultSelectedIds`): a checkbox leads each Item that has a `value`. With a `title`, the header gets select all.
- `loading` (with `loadingRows`, default 3): skeleton rows, after any rows already there, so it also covers load more. `empty`: shown when there are no rows, usually a compact EmptyState. `footer`: a row under the rest, for "View all" or load more.

## Row behavior, per Item

- `href` makes the row a link and `onClick` a button. The title is the one target, stretched over the row; the badge, meta, actions and checkbox stay separately clickable above it. Link and button rows hover in the ink's own tint (`opacity-hover`) and press a step further.
- `current`: the row whose details are open, on `select` with its text one step up (`aria-current="page"` on a link, `"true"` otherwise).
- `value`: the row's id for selection. Checked rows take `select` too. A row with no link toggles when clicked anywhere; a link row opens, and only its checkbox toggles.
- `selectable={false}`: the row still opens but stays out of the selection (an owner who cannot be removed). `disabled`: faint, not clickable, out of the selection.
- `resolved`: stays in place on `row-done` with a `muted` title, so the list never jumps.

## Keyboard

Arrow keys, Home and End move between the rows' targets, skipping disabled rows. Tab still reaches every row's actions. Focus draws the 2px `ink` outline 2px inside the row, so the list's clip never cuts it.

## Rules

- Pick one row behavior per list: static, links or buttons. Mixing them hides which rows open.
- Current and selected are different questions. Current is the one open; selected is the ones a bulk action will touch. Show the count and the bulk actions above the list while anything is selected.
- No bars, borders or shadows on rows. State is the ground and the text step.
- For columns that line up across rows, sorting and hundreds of rows, use Table.
- `ItemGroup` is the earlier name: `variant="compact"` is a plain list of `sm` rows.

