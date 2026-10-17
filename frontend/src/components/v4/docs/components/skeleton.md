# Skeleton

> **v4 status:** Primitive installed: [`ui/skeleton.tsx`](../../ui/skeleton.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

Holds the shape of content while it loads, so the layout does not jump. Blocks are `line-soft` and pulse gently; they stop under reduced motion.

## You provide

- `width` and `height` for a block, or `lines` for a paragraph (the last line runs 60%).
- Compose them into the real layout: a media square plus two lines for an item, a row of blocks for a table row.
- Set `aria-busy="true"` on the region that is loading; skeletons themselves are hidden from screen readers.

## Rules

- Match the real layout closely: same heights, same gaps.
- Show skeletons after about 300ms; faster loads should just appear.
