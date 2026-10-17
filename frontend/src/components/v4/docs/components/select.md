# Select

> **v4 status:** Implemented as [`ui/select.tsx`](../../ui/select.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet.

Pick one value from a short, known list. The trigger looks like an Input with an up-down chevron; the list is a listbox with keyboard support and a check on the chosen option.

## You provide

- `options`: `[{ value, label, description?, disabled?, group? }]`. Consecutive options with the same `group` get a heading.
- `value` and `onChange`, or `defaultValue`.
- `placeholder` when nothing is chosen ("Choose an environment").
- `label` for the stacked variant: a small label inside a 40px (lg) trigger, for filters in page headers.
- `size="sm"`, `disabled`, `invalid`, `align="end"`, `menuWidth`.

## Rules

- Up to about 12 options. Longer or searchable lists use Combobox; several values from a short list use MultiSelect.
- `description` is short metadata on the right ("Expires Oct 1"), not help text.
- The list opens at the trigger's width and its options line up with the trigger: an option's text starts where the value does, and its check ends under the chevron. Keep `menuWidth` at least the trigger's width so that line holds.
- Never use a Select for two options; use a Switch or segmented Tabs.
