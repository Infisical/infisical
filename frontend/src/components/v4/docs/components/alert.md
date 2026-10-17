# Alert

> **v4 status:** Partly implemented. The base is [`ui/alert.tsx`](../../ui/alert.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. `Banner` is not yet implemented.

Says what happened and what to do next, inline in the page. Each tone has its wash, border, icon and a deep title color, and `Banner` is the full-width form for standing conditions like working in production: `accent-wash` ground, `accent-line` border, ink text and an `accent-fg` icon and link.

## You provide

- `tone`: `info` (default), `ok`, `warn`, `bad`. Error alerts get `role="alert"`; the rest `role="status"`.
- `title`: the fact ("Sync to Vercel failed"). `children`: the cause and the fix, one or two sentences.
- `actions`: a small secondary Button and optionally a link Button. `onDismiss` for alerts people can clear.
- `Banner`: `children` (text, keys in `code`), `icon` (default lock), `action` (a link or a button), `onDismiss`.

## Rules

- Title first, then what to do. Never "Error" or "Something went wrong".
- One alert per concern; stack at most two.
- Banners are for conditions that last the whole visit, not for events. Events are Toasts.
