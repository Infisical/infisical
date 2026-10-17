# Loader

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

A status that wraps a Spinner with its label, so people know what Infisical is loading and where it will appear.

## Sizes

- `inline`: an inline Spinner beside the label, in the size and color of the text around it ("Syncing 14 secrets", "Rotating"). For rows, table cells and status lines.
- `base` (the default): a base Spinner centered in the card, panel, sheet or table body while its content loads, with the `label` under it in `small` muted.
- `page`: a page Spinner that fills a view while its first data loads. The pixels assemble into the mark once, then the run loops. Always give it a `label`; add a `description` when the wait may be long.

## You provide

- `label`: what is loading, as a present participle naming the object: "Loading secrets", "Connecting to Vercel", "Syncing 14 secrets". Without one, screen readers hear "Loading".
- `description` (page only): one muted line, for example "Large projects can take up to a minute."
- `delay`: milliseconds before it appears. Use about 300 for base and page so fast loads never flash.

## Rules

- A Loader is a Spinner plus its label and a `status` role. Reach for a bare Spinner only when nearby text already says what is happening, as in a toast title or a link button.
- Buttons do not take a Loader. `loading` sweeps a halftone band across the button (see Button).
- Use it for waits you cannot measure. A known count uses Progress; a layout you already know uses Skeleton.
- One loader per region. A page loader replaces the whole view, so nothing inside it shows its own loader.
- The page loader's assembly is the system's one entrance flourish. Do not replay it; if loading restarts, keep the loop running.
- It announces politely as a status. Under reduced motion the Spinner holds still and the label carries the message.
