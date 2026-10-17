# Pagination

> **v4 status:** Primitive installed: [`ui/pagination.tsx`](../../ui/pagination.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

Says how many there are and moves through them. It sits where the table ends, range on the left, controls on the right.

## Variants

- `numbered` (default): range, previous, pages with gaps, next. The current page is an ink square.
- `compact`: "Page 2 of 17" between previous and next, for narrow spaces and sheets.
- `more`: a "Show 25 more" button and a live count, for feeds and activity.

## You provide

- `page` / `onPageChange` or `defaultPage`; `pageCount`, or `total` with `pageSize` (which also shows the range "26–50 of 412").
- `pageSizeOptions` with `onPageSizeChange` adds "Rows per page".

## Rules

- Always show the total. People decide whether to filter from it.
- Keep controls in the same place on every page so repeated clicks land.
