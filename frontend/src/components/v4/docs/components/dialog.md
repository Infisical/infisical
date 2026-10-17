# Dialog

> **v4 status:** Primitive installed: [`ui/dialog.tsx`](../../ui/dialog.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

A focused task that needs a few fields: a title that names the task, one line on why, the fields, then Cancel and one primary that repeats the title's verb.

## You provide

- `open` and `onOpenChange(false)` (the close button, Escape and a click on the scrim call it).
- `title` ("Add secret"), `description` (one sentence), `children` (Fields), `footer` (Cancel then the primary).
- `width` (default 440), `dismissible={false}` to ignore scrim clicks while saving.

Focus moves to the first field on open, stays inside while open, and returns to the trigger on close.

## Rules

- One primary. Its label is the title's verb and object.
- If it needs more than about five fields or a second step, use a Sheet or a page.
