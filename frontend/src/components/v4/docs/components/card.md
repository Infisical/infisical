# Card

> **v4 status:** Partly implemented. The base is [`ui/card.tsx`](../../ui/card.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#card`. `Tile` and the nested container (a tint shell around an inset surface) are not yet implemented.

Groups content about one thing. The default is Infisical's framed container: a borderless tint shell whose uppercase header sits inside it, around an inset surface lifted by `shadow-raised`.

## Variants

- `framed` (default): `title` (short, it renders as an eyebrow), `action` (a link, "View report"), `children` in the inset surface. `flush` removes the body padding for tables and lists.
- `plain`: a standalone object with `media` (a `Media` tile), `title`, `description`, `action` (a badge), `children` and `footer` (buttons, right aligned). Its header is an Item with card type: the badge is the Item's meta.
- `Tile`: an Item inside a selectable card button with `media`, `title`, `description`, `selected`, `onClick`. Selected gets a 1px ink border and a checked box; keyboard focus adds a 2px ink outline. Lay tiles out in a tile grid.

`DataList` fills a card: `items` as `[term, value]` pairs. The default (`stat`) sets big values beside their terms; `variant="meta"` gives the label and value pairs inside a plain card; `variant="props"` gives the bordered label and value rows used in sheets.

## Overflow

Cards handle a narrow container the way tables do: nothing squeezes past its floor, overlaps or clips, and truncated text shows in full on hover.

- Framed header: the eyebrow truncates; the action keeps its width.
- `stat` rows: terms wrap; a value never shrinks, up to 60% of the row, then truncates.
- Plain header: the `action` badge ends the title line and the title wraps beside it; the description runs on under it. The heading keeps `size-text-min` (160px); narrower than the media plus that floor, the heading drops under the media.
- `meta` rows: labels take up to 45% and wrap; values truncate. Use MiddleTruncate for values whose end matters (repositories, paths, hosts).
- Footer buttons keep their width and wrap onto a second line, still right aligned.
- Tiles: names take two lines, then an ellipsis; descriptions one. The tile grid drops a column instead of squeezing a tile under `size-tile-min` (208px; the floor is adjustable per grid).

## Rules

- Headers live inside the frame, never above the card.
- Do not nest framed cards. A card inside a card is a list.
- Big numbers use tabular figures and say what they count.
