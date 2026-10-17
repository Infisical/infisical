# AnimatedCollapse

> **v4 status:** Partly implemented. The base is [`ui/collapsible.tsx`](../../ui/collapsible.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#collapsible`. It covers open and close. The height and fade animation described here is not yet implemented.

Shows and hides a region by animating its height, over 200ms on the shared slide curve (`cubic-bezier(.2, 0, 0, 1)`, the tab indicator's), with a matching fade. A utility for disclosures, accordions, settings that reveal their options, FileTree folders and Json nodes.

## You provide

- `open`: whether the content shows. You own the trigger; give it `aria-expanded` and `aria-controls` pointing at the collapse's `id`.
- `children`: the content. It keeps its natural height; nothing to measure.
- `lazy`: mount the children on first open, then keep them (large trees, JSON).
- `id`, `className`, `style`, `onTransitionEnd`.

## Behavior

- It animates a grid row from `0fr` to `1fr`, so content of any height opens smoothly and nested collapses work.
- It never animates on first paint: a region that starts open is simply open.
- Closed content is `visibility: hidden` after the close finishes, so it leaves the tab order and the accessibility tree.
- Content clips only while it moves or while closed. Once open, focus outlines, tooltips and popovers inside it are never cut.
- Under `prefers-reduced-motion` it opens and closes at once.

## Rules

- Motion follows a choice: open a region because someone asked for it, never on a timer or on hover.
- Chevrons on the trigger turn with it over the same 200ms: `chev-right` rotates to point down.
- Do not hide anything essential by default, such as the reason a button is disabled.
