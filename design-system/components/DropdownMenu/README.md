# DropdownMenu

A short list of actions on one object, opened from a button. Arrow keys move, Enter picks, Escape closes and returns focus to the trigger.

## You provide

- `trigger`: a Button element (usually `variant="ghost"` with `icon="more"` and an `aria-label`). It gets `aria-haspopup` and `aria-expanded` for you.
- `items`: an array. `{ label, icon?, shortcut?, meta?, danger?, disabled?, submenu?, onSelect? }` for actions; `{ type: 'separator' }`; `{ type: 'label', label }` for a group heading; `{ type: 'checkbox' | 'radio', label, checked, onSelect }` for settings that stay open.
- `label`: the menu's accessible name. `align="end"` for triggers on the right edge; `width` (default 220).

## Rules

- Order: most used first, destructive last, after a separator, with `danger`. A danger item is `bad` all the way through: label, icon and hover ground.
- Hover and the keyboard's active item take the item's own color at `opacity-hover`, never `select`. Icons match their label.
- Items share the listbox's rows: the menu pads 3px and each item 7px, so icons and labels start 11px from the menu's edge and hover grounds sit 4px from it. Separators run the full width with 3px above and below, the same space as the sides.
- Shortcuts render as small Kbd caps and match what the app binds (`⌘C`, or `mod+C` to follow the platform).
- Six to eight items at most. More belongs in a page or a Combobox.
- Do not hide the only way to do something in a menu.
