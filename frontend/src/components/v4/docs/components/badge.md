# Badge

> **v4 status:** Primitive installed: [`ui/badge.tsx`](../../ui/badge.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

One or two words about an object's type or state. Status badges always carry the word, and a dot when the state is live; color is never the only signal.

## Tones

- `outline` (default): the identity type, muted ("Machine", "Person", "Agent").
- `soft`: a property of the object ("Rotating", "Dynamic", "Current").
- `ok`, `warn`, `bad`, `info`: status, with `dot` when it can change on its own ("Synced", "Expiring", "Blocked", "Pending").
- `solid`: the production environment (`mono`), and nothing else that often.
- `accent`: "New" or "Beta", once per screen.

`Count` is the number chip for navigation and tabs: accent by default, with no edge (its number carries the contrast), `tone="ink"` beside the accent.

## You provide

- `children`: sentence case, no punctuation. `size="sm"` (18px) inside rows and tables. `mono` for slugs and versions (`prod`, `v15`).

## Rules

- A badge is not a button. If it filters, use segmented Tabs.
- Never stack more than three badges on one object.
