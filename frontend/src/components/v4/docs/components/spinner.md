# Spinner

> **v4 status:** Partly implemented. The base is [`ui/spinner.tsx`](../../ui/spinner.tsx), a shadcn Radix primitive restyled by `v4.css`. It is listed at `/design-system`, with no rendered preview yet. The pixel-grid mark, the page spinner and the busy-button halftone described here are not yet implemented.

The Infisical infinity, moving while something works: two pixels for a line of text, or the mark in pixels for a card or a whole view. Loader wraps it with a label.

## Sizes

- `inline` (16 by 8, the default): two pixels that trade size against each other, an abstract infinity. Each one steps between 6, 4 and 2px, so the pair always adds up to 8: the left one full while the right one is small, both at 4 as they cross, then the other way, once every 1.2s. It takes the text color. For toasts, rows, status lines and link buttons.
- `base` (47 by 23): the mark on a 16 by 8 grid, 2px pixels on a 3px pitch. A lit run loops the figure eight every 1.6s (up and around the right loop, through the crossing, around the left loop), fading in four steps.
- `page` (159 by 79): a 32 by 16 grid, 4px pixels on a 5px pitch, looping every 2.4s. The pixels assemble into the mark once, over about 1s, before the run starts.

## You provide

- `size`: `inline`, `base` or `page`.
- `label` when it stands alone, so it announces as a status. Next to text that already says what is happening (a toast title, a link button's label), or inside a Loader, leave it out.

## Color

- `inline` uses `currentColor`, so it matches the text beside it.
- `base` and `page` use `mark`: ink in light, accent in dark, the same inks as the logo files.
- Never set it on a status color or recolor it by hand.

## Rules

- Beside a status message, use a Loader `inline`, which sets the status role and pairs the Spinner with its label. In a card, panel or view, use a Loader `base` or `page` rather than a bare Spinner.
- Buttons take `loading`, which sweeps a halftone band across the button (see Button). Only `link` buttons show the inline Spinner, since they have no box.
- Use it for waits you cannot measure. A known count uses Progress; a layout you already know uses Skeleton.
- The page assembly is the system's one entrance flourish. Do not replay it; if loading restarts, keep the loop running.
- Under reduced motion it holds still: `inline` as two 4px pixels, `base` and `page` as the full mark.
