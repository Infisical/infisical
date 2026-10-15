# Sheet

Details and edits for one row without leaving the list. It slides over the right edge at 440px, with the object's type as an eyebrow, its name as the title and its state as badges.

## You provide

- `open` / `onOpenChange`, `eyebrow` ("Secret"), `title`, `monoTitle` for keys, `meta` (badges), `actions` (extra icon buttons beside Close).
- `children`: the body (fields, a `DataList variant="props"`, history). It scrolls on its own.
- `footer`: the destructive entry on the left (`danger-ghost`), Cancel and Save grouped on the right in `.ifs-sheet__footer-end`.

## Rules

- Keep the list visible behind it; the sheet is for one object at a time.
- Save only what changed, and confirm with a Toast.
