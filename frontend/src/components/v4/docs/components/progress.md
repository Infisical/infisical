# Progress

> **v4 status:** Implemented as [`ui/progress.tsx`](../../ui/progress.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet.

Shows real counts when you have them. A 6px ink bar on a `line-soft` track; usage meters turn `warn` at 80% and `bad` at 100%, and the words change with them.

## You provide

- `value` and `max` (default 100). Leave `value` out for indeterminate work.
- `label` (what is happening) and `valueLabel` (mono: "9 of 14", "412 of 500").
- `tone`: `ink` (default), `warn`, `bad`, or `auto` for the thresholds (`warnAt` changes the 0.8).
- `ProgressSteps` `{ steps, current, label }` for a known sequence ("Generate, Propagate, Verify, Revoke old"); the current step is hatched.

## Rules

- Prefer counts to percentages. Say "About 1 min" only when you can estimate it.
- Over the limit, say so in words: "10,400 of 10,000, over".
