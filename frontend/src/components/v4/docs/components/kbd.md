# Kbd

> **v4 status:** Implemented as [`ui/kbd.tsx`](../../ui/kbd.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet.

A keyboard shortcut drawn as flat key caps: mono, `muted` on a `tint` cap with a `line` border, one cap per key, 2px apart. Menus, tooltips and inputs draw their shortcut hints with it.

## You provide

- `keys`, or a string as `children`: a shortcut string or an array. `"⌘K"` and `"⌘⇧P"` split each modifier symbol into its own cap; `"mod+K"`, `"Ctrl+Shift+P"` split on `+`; `"G then S"` is a sequence, with a muted "then" between the steps. Arrays work too: `['mod', 'K']`, or `[['G'], ['S']]` for a sequence.
- Key names turn into their glyphs: `mod` is ⌘ on Apple platforms and Ctrl elsewhere; `shift`, `alt` and `ctrl` are ⇧, ⌥ and ⌃ on Apple and words elsewhere; `enter` ↵, `esc` Esc, `backspace` ⌫, `up` ↑. Single letters are uppercased.
- `size`: `md` (20px, the default) inside text and docs; `sm` (18px) inside controls and menus. In a Tooltip the caps are 16px and drawn on ink. Inside a field the hint takes a nested slot like the field's buttons (28px in a 36px field), so its caps sit as far from the field's edge as from its top and bottom.
- `platform`: `auto` (the default), `mac` or `other`, to show one platform's keys on purpose.

## Rules

- Show the shortcut the app actually binds, and write `mod` for anything that is ⌘ on macOS and Ctrl elsewhere, so each person sees their own keys.
- Screen readers hear the key names ("Command K"), not the glyphs. Do not add your own aria-label.
- DropdownMenu `shortcut`, Tooltip `shortcut` and Input or InputGroup `kbd` all render a Kbd; pass them the same strings. Never type a shortcut as bare mono text.
- One shortcut per hint. If two bindings do the same thing, show the one people should learn.
