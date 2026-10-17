# Checkbox

> **v4 status:** Implemented as [`ui/checkbox.tsx`](../../ui/checkbox.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet.

An independent yes or no, or one of several picks in a list. Checked is an ink square with an on-ink check; a parent with some children checked shows the mixed state.

## You provide

- `checked` and `onChange(next)`, or `defaultChecked`.
- `indeterminate` for a parent whose children are partly checked; clicking it checks all.
- `label` and optional `description`. Without a label, pass `aria-label` (tables do this per row).
- `disabled`.

## Rules

- Use a Checkbox when the choice takes effect on submit; use a Switch when it takes effect at once.
- Labels say what is true when checked: "Mask values in logs", not "Don't show values".
- Stack options vertically 12px apart, or in a row 20px apart for three or fewer short labels.
