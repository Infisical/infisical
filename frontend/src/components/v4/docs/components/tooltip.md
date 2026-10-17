# Tooltip

> **v4 status:** Implemented as [`ui/tooltip.tsx`](../../ui/tooltip.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#tooltip`.

A short label for an icon button or a truncated value, on hover after 300ms and on focus at once. Ink bubble, on-ink text, an 8px nub pointing at the trigger.

## You provide

- `children`: exactly one focusable element (a Button, a link).
- `content`: a few words, the same as the trigger's `aria-label` for icon buttons.
- `side`: `top` (default), `bottom`, `left`, `right`. Top and bottom tips float into the body, so a scroll box or the window's edge never clips them, and they flip to the other side when theirs has no room (a top bar's icon buttons get theirs below). `shortcut`: a Kbd drawn on ink ("⌘C", or "mod+C" to follow the platform). `wrap`: allows two lines up to 176px for a short explanation.

## Rules

- Never put anything interactive or essential in a tooltip; use a Popover.
- Disabled buttons get no hover or focus, so their tooltip never shows. Explain the rule with an info icon button beside it, as the preview does.
- Do not tooltip a button that already has a visible label.
