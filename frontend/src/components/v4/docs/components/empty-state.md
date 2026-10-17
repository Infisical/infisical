# EmptyState

> **v4 status:** Primitive installed: [`ui/empty.tsx`](../../ui/empty.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

Explains why a place is empty and offers the next step. First use gets an icon tile, a title, one line and actions; "no results" gets a compact line with a way to clear the filter.

## You provide

- `icon` (default inbox), `title` (what is missing: "No secrets in staging yet"), `description` (why it matters or where they come from), `actions` (the primary way in, then an alternative).
- `variant="compact"` with `title` and `actions` (a link Button) for filtered lists.

## Rules

- Name the object and the place. Never "No data".
- Offer the fastest real path first: "Import from .env" beats a blank form when people have one.
