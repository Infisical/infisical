# MultiSelect

Pick several values, or one, from a short known list, without typing: environments, regions, scopes, columns. The trigger is a button, never an input, and it can show something other than the picks. The list has a check per option and, when several can be picked, a bar with the count and quick Select all and Deselect all.

## You provide

- `options`: `[{ value, label, description?, disabled?, group? }]`, like Select. Options with the same `group` share a heading.
- `value` / `onChange`, or `defaultValue`: an array of values, or one value (or null) when `multiple={false}`.
- `multiple` (default true). Single mode closes on a pick; add `clearable` for a bar with Clear.
- The trigger, one of three ways:
  - Nothing: a Select-style trigger that summarizes the picks as the first label plus a count ("Staging +1"), `placeholder` when none, and `allLabel` when every option is on ("All environments").
  - `renderValue(values, options)`: your own content inside that trigger, such as environment slugs as badges.
  - `trigger`: your own button element, such as a toolbar Button with a Count. It gets `aria-haspopup`, `aria-expanded` and the click handler.
- `label` for the stacked variant, `size="sm"`, `disabled`, `invalid`, `align="end"`, `side="top"`, `menuWidth`, `quickActions={false}`, `open` / `onOpenChange` or `defaultOpen`, `aria-label`.

## Behavior

- Picks apply at once and the list stays open. Escape, a click outside or Tab closes it; Escape returns focus to the trigger.
- Keyboard: Up, Down, Home and End move; Space or Enter toggles; ⌘A or Ctrl+A selects all, or deselects all when everything is on; typing jumps to the next label that starts with what you typed.
- Select all and Deselect all skip disabled options, which keep whatever they had. The count ("2 of 6 selected") is announced politely.
- Values keep the options' order, so summaries read the same way every time.

## Rules

- Up to about 12 options. Longer or searchable lists use Combobox with `multiple`.
- Filters apply as people pick. For a choice that needs a Save, put the MultiSelect in a Popover or form with its own button.
- Use `allLabel` whenever "everything" has a name people use.
- One at a time with no need for a custom trigger or Clear is a Select.
