# Icon

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

Infisical's line icons: a 24px grid, 1.7 stroke, round caps and joins, drawn in `currentColor`. 16px inside controls, 18px in navigation and list media, 14px in small buttons.

## You provide

- `name`: one of the 51 names in [`assets/icons/icons.json`](../../assets/icons/icons.json).
- `size` in px (default 16), `strokeWidth` (default 1.7; checks in checkboxes use 2.6).
- `label` only when the icon stands alone and means something; otherwise it is hidden from screen readers.

## Rules

- Icons support a label; they rarely replace one. Icon-only buttons need an `aria-label` and a Tooltip.
- Never recolor an icon to carry status on its own; pair it with a word.
- The path data ships as [`assets/icons/icons.json`](../../assets/icons/icons.json). Until the v4 `Icon` component exists, wrap an entry in the SVG shell described in [`assets/icons/README.md`](../../assets/icons/README.md).
