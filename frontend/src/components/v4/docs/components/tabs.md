# Tabs

> **v4 status:** Implemented as [`ui/tabs.tsx`](../../ui/tabs.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#tabs`.

Switches between sections of one object, or between views of the same data. Underline tabs sit on a `line` rule under a 2px ink bar; segmented tabs sit in a `tint` track under a `surface` thumb with a `control` border. Either runs horizontally or vertically, and the bar or thumb slides to the tab you pick.

## You provide

- `tabs`: `[{ value, label, count?, content? }]`. `count` is a mono chip on underline tabs ("15" versions) and a muted mono number on segmented ones. Leave `content` out to render panels yourself, for example a filtered list under a segmented filter.
- `value` / `onChange`, or `defaultValue`. `label` names the tablist.
- `variant`: `underline` (default) for sections of one object; `segmented` for a small set of peer views of the same data, filters with counts included. Segmented replaced ToggleGroup.
- `orientation`: `horizontal` (default) or `vertical`. Vertical puts the list left of the panel. Underline tabs are 36px tall there, like nav rows, and keep their rule between list and panel, on the list's right edge. The segmented track becomes a column with each count at the end of its row.

## Motion

- Each tablist has one indicator: the underline bar or the segmented thumb. On a change it moves along the track and resizes to the new tab over 200ms, `cubic-bezier(.2, 0, 0, 1)`, jumps included. It never overshoots. Label color and weight ease over the same 200ms.
- It never animates in. First paint, resizes and font loads place it without motion. Under `prefers-reduced-motion` it jumps.
- Tabs never draw their own selected edge, and every tab reserves its selected (600) width, so picking a tab never moves its neighbors.

## Overflow

- A tablist that runs out of room scrolls, with no scrollbar. Horizontal lists scroll across; vertical lists scroll when the Tabs are given a `height` or `max-height`.
- Each edge with more tabs past it fades out over 32px. The fade grows in as you scroll away from that end, so a list at rest only fades the edge that hides something. The rule under underline tabs and the segmented track never fade; only the tabs and their indicator do.
- Picking or focusing a tab scrolls it clear of the fade: smoothly on a change, instantly on first paint and on resize, instantly under `prefers-reduced-motion`.
- A vertical mouse wheel over a horizontal list scrolls the list until it reaches an end, then the page scrolls again. Touch and trackpads scroll it natively.
- Focus outlines have 4px of room inside the scroller, so they never clip.

## Rules

- Two to six tabs across. Vertical suits longer lists of sections, such as settings. Labels are nouns, one word where possible: "Overview", "Versions", "Access", "Syncs".
- Arrow keys move between tabs and the panel follows: left and right across, up and down when vertical. Home and End go to the first and last.
- Segmented is for choices that change the same view, like an environment or a filter. Use underline for different content.
- Do not use tabs for steps in a flow.
