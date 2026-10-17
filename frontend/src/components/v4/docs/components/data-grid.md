# DataGrid

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

A spreadsheet over database rows, like a Postgres table editor: typed column headers, a row number gutter, one active cell and a rectangular range, keyboard navigation, inline edits, NULL, copy and paste as TSV, resizable columns and virtual rows.

## You provide

- `columns`: `[{ key, name?, type?, primaryKey?, nullable?, editable?, width?, minWidth?, maxWidth?, align?, format?, parse?, render?, sortable? }]`.
  - `type` is the Postgres type (`uuid`, `text`, `int4`, `numeric`, `bool`, `timestamptz`, `jsonb`). It shows muted beside the name, right-aligns number types, and decides what an edit accepts: an `int4` cell refuses "abc" and keeps editing with a `bad` outline.
  - Columns fit their content like Table's: never under `size-cell-min` (64px) or `minWidth`, capped by `maxWidth` with an ellipsis and the full value on hover. People drag a header edge to resize; a double-click fits it again.
  - `primaryKey` adds the key icon and makes the column read only unless `editable` says otherwise. `nullable` lets Delete, Backspace and an empty edit save NULL.
- `rows`, `getRowId` (defaults to `row.id`) and `label`, usually the table name (`public.secret_versions`).
- `editable` and `onCellsChange(changes)`: every edit, clear and paste arrives as one list of `{ rowId, rowIndex, row, key, value, previous }`. Keep them, show the rows with them applied, and pass them back as `dirty` (row id, then column key) until they are saved or discarded.
- `height` for a fixed viewport with virtual rows (32px, or `rowHeight`); leave it out and the grid is as tall as its rows.
- `sort` and `onSortChange` add a sort button to each header. `onSelectionChange`, `onColumnResize` and `onCopy` report what people do. `footer` is a mono status bar under the grid.

## Rules

- Everything in the grid is mono: values, names and types. NULL reads as a muted `NULL`, never an empty cell.
- The active cell has a 2px ink outline inside its edge; a range takes `select`, and its row numbers and column names step up to `ink`. No other marks.
- Unsaved cells sit on `warn-wash`. Say how many above the grid ("2 unsaved changes") with Discard and a primary Save changes; after saving, say so ("Saved 2 changes").
- Keys: arrows move (Cmd or Ctrl to the edge), Shift extends, Enter or F2 or typing edits, Enter commits and moves down, Tab commits and moves right, Escape cancels, Delete clears the range, Cmd or Ctrl+A selects all, Cmd or Ctrl+C copies.
- Read-only results (query output, audit exports) leave `editable` off; the grid still selects, copies and resizes.
- For lists of objects with actions and bulk selection, use Table.
