# AlertDialog

> **v4 status:** Implemented as [`ui/alert-dialog.tsx`](../../ui/alert-dialog.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#alert-dialog`.

Confirms something that is hard to undo. Name the object, say what breaks, and make the safe choice easy: Cancel comes first and is focused unless typing is required.

## You provide

- `open` / `onOpenChange`, `title` ("Delete stripe_api_key?"), `description` (the consequence and any way back).
- `confirmLabel` ("Delete secret"), `onConfirm`, `cancelLabel`.
- `confirmText`: the exact text to type before the confirm button enables. Use it for production and for anything with dependents.
- `tone="neutral"` for a confirmation that is not destructive (no icon tile, primary button). `icon` to change the tile's icon.

## Rules

- The scrim does not close it; only Cancel, Escape or the confirm button.
- Say what happens to syncs, versions and dependents, and how long it can be restored.
