# Input

> **v4 status:** Implemented as [`ui/input.tsx`](../../ui/input.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#input`.

A single-line text box, 36px tall. Its `control` border turns `ink` on focus, with a 3px outline of `ink` at `opacity-nudge` outside it. Use `mono` for keys, paths and hostnames; use SecretInput for values.

## You provide

- Any native input props (`value`, `onChange`, `placeholder`, `type`, `name`, `disabled`, `readOnly`).
- `icon`: a leading icon (search for filters). Read-only inputs get the lock icon automatically.
- `mono`: Geist Mono for machine text.
- `size="sm"`: 32px, for toolbars and table filters.
- `invalid`: a `bad-control` border at rest, no outline; focused, a `bad` border and the 3px `bad` nudge outline. Inside a Field, pass `error` to the Field instead.
- `kbd`: a shortcut hint on the right, drawn as a small Kbd ("/" to focus search).
- `trailing`: more nested items after the hint, such as a clear or copy icon button (`CopyButton`, or `Button variant="ghost" iconOnly`). They join one group at the field's end: each in a 28px slot (24px small, 32px large) 4px from the field's edge, slots 4px apart, 8px from the text.
- `multiline`: a textarea with the same frame.

`SecretInput` shows a masked value with Reveal and Copy buttons, grouped 4px apart: `value`, `maskLength`, `onCopy`, `copyable`, `size`.

## Rules

- Placeholders show an example, never the label: "Filter by name", "stripe_api_key".
- Never prefill a secret value into a plain Input.
- Read-only is for values people copy; disabled is for values that do not apply.
