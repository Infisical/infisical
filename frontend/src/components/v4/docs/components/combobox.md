# Combobox

> **v4 status:** Primitive installed: [`ui/combobox.tsx`](../../ui/combobox.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

Type to filter a long list, then pick one value or several. Matches are highlighted in the accent; if nothing matches and `onCreate` is set, the last row offers to create it.

## You provide

- `options`: `[{ value, label, meta? }]`. `meta` is mono text on the right (counts, versions).
- `value` / `defaultValue` / `onChange`. With `multiple`, the value is an array and picks show as removable chips.
- `placeholder`, `mono` (for keys and environment slugs), `onCreate(query)`, `emptyText`.

## Rules

- Filter on what people type, case-insensitive, anywhere in the label.
- For several values from a short list that people do not need to search, use MultiSelect: a button trigger with Select all and Deselect all.
- Keep the create row last and name exactly what will be created.
- Backspace in an empty multi-select removes the last chip; say so nowhere, it is expected.
