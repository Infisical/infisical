# Separator

> **v4 status:** Primitive installed: [`ui/separator.tsx`](../../ui/separator.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. Its core behavior is there; check the primitive before relying on anything else described below.

A 1px rule. `line` between sections, `line-soft` between rows inside a surface, vertical between groups in a toolbar, and labeled for time breaks in activity.

## You provide

- `soft` for rows, `orientation="vertical"` (20px tall) for toolbars.
- `label` for a labeled rule ("Earlier this week"); `align="center"` centers the label ("or").

## Rules

- Prefer space to rules. Use a separator when two groups would otherwise read as one.
- Never put a separator directly under a header that already has a border.
