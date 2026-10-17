# Table

> **v4 status:** Partly implemented. The base is [`ui/table.tsx`](../../ui/table.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Column sizing, `maxWidth` truncation and load more are not yet implemented.

Built for scanning hundreds of rows: an uppercase header inside the tint frame, 48px rows on the inset surface, columns that fit their content, the primary column in mono, and row actions at the end, never in the name.

## You provide

- `columns`: `[{ key, header, width?, minWidth?, maxWidth?, grow?, align?, render?, primary?, sortable?, hideHeader?, actions?, pin? }]`.
  - Leave `width` out and the column fits its widest cell, header included, never under `size-cell-min` (64px) or its `minWidth`.
  - `maxWidth` caps a column: its text truncates with an ellipsis and shows in full on hover. Badges, avatars and marks in the cell keep their size.
  - `width` (`120` or `'120px'`) fixes a track, for icon columns.
  - The first column without a `width` takes spare width; `grow` moves that to another column, `grow: false` leaves it empty.
  - `primary` renders the value in mono ink. `hideHeader` keeps the header for screen readers only.
  - `actions` makes the row actions column: it fits its buttons with no 64px floor, aligns them to the end 4px apart, keeps its header for screen readers only, and pins to the right edge while the table scrolls sideways. `pin` pins any last column, or `pin: false` lets actions scroll.
- `rows` and `getRowId` (defaults to `row.id`), `label` (the table's accessible name).
- `variant`: `basic` (default, a rule between rows), `striped` (every other row on `row-done`, no rules) or `bordered` (rules between columns too).
- `selectable` with `selectedIds` / `onSelectionChange` (or `defaultSelectedIds`) and `rowLabel(row)` for each checkbox's name.
- `sort` `{ key, dir }` and `onSortChange`. `empty` for no rows.
- `height` for a fixed viewport: the header sticks and the body scrolls; change it and the viewport eases to the new height. Add `virtual` for thousands of rows (only the rows in view render; rows are `rowHeight`, default 48), and `loadMore` `{ label, onClick, loading }` to fade the end of the viewport under a floating button that fetches the next batch.
- `EnvMark` `{ present, env }`: the check or minus used in environment columns.

## Rules

- Cells never wrap or squeeze. When the columns add up to more than the container, the table scrolls sideways inside its shell and fades out at the edge that has more.
- Give long, variable text a `maxWidth` (names, paths, descriptions). Keep keys whole where there is room; never truncate a secret key without the hover title or a way to open it.
- Row actions go in one `actions` column, last: ghost `sm` icon buttons (32px, with an `aria-label`) or one DropdownMenu trigger, two at most. Never size it with `width`; it fits its buttons, and the 15px inset past it leaves room for their focus outline. When the table scrolls sideways it stays pinned, and content passes under it behind a `line-soft` rule instead of the edge fade.
- Virtual tables: give variable columns a `width` or `maxWidth` so tracks hold still as rows mount.
- `loadMore` is for batches the person asks for. Say how many are loaded ("Showing 1,000 of 12,408") and drop `loadMore` once everything is in. To show more at once as well, grow `height` with each press up to a ceiling (for example 360px, then five rows more per press, up to 840px).
- A selected row takes the `select` ground and its text steps up to `ink`. No edge bar, border or shadow on rows.
- When rows are selected, swap the toolbar for bulk actions and a count ("2 selected").
- Put Pagination under a paged table and say how many there are.
- Row menus (DropdownMenu) float out of the table on their own, so the scroll box never clips them.
- Pick one variant per table and keep it for the page. Striped suits long rows read across; bordered suits dense numbers and comparisons.
- For editing cell by cell, ranges and database rows, use DataGrid.
