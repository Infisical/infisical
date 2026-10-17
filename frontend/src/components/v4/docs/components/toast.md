# Toast

> **v4 status:** Implemented as [`ui/sonner.tsx`](../../ui/sonner.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet.

Confirms what just happened, bottom right, newest at the bottom. It offers Undo instead of asking first. It follows the theme: `surface` with a `line` border and `shadow-pop` in light, a raised gray in dark.

## You provide

- `title` (past tense: "Secret saved"), `description` (what follows: "Syncing to Vercel and GitHub Actions").
- `tone`: `neutral`, `ok`, `bad`; or `loading` for work in progress (the inline Spinner, no dismiss). `icon` to override.
- `action` `{ label, onClick }` in `accent-fg` ("Undo", "Retry"): ink in light, the accent in dark; `onDismiss`; `duration` in ms to auto-dismiss (leave errors up).
- `ToastStack` holds them: fixed bottom right by default, `inline` for layouts like this preview.

## Rules

- One line of title, one of description. If it needs more, it is an Alert.
- Errors stay until dismissed; successes can leave after about 5 seconds.
