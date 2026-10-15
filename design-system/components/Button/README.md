# Button

One action, named with a verb: "Add secret", "Approve", "Revoke access". Secondary is the default; use primary once per view for the thing the page is for.

## Variants

- `primary`: ink fill. The one main action in a view or dialog.
- `secondary` (default): surface with a `control` border. Everything else.
- `ghost`: no border. Toolbars, row actions, close buttons. Hover and press take the label's color at `opacity-hover` and `opacity-press`, like every quiet action.
- `accent`: the yellow. Approval and grant moments only ("Grant for 1 hour"), never as a second primary.
- `destructive`: `bad` fill, only inside an alert dialog that confirms the loss.
- `danger-ghost`: red text, no fill. The entry point to a destructive flow ("Delete" in a sheet footer).
- `link`: underlined text for low-weight actions inside copy ("Undo", "View sync log").

## You provide

- `children`: the label, sentence case, verb first. No trailing period, no "please".
- `size`: `sm` (32px) in tables, toolbars and dense rows; `md` (36px) by default; `lg` (40px) for a page's main call to action.
- `icon` / `iconRight`: an icon name from the Icon set. Lead with an icon only when it helps scanning (plus for add, trash for delete).
- `iconOnly` with `aria-label`: a square button. Always pair with a Tooltip that repeats the label.
- `loading`: sets `aria-busy` and sweeps a halftone band across the button, on the Spinner's 3px pixel grid. The icon, label and width stay put; change the label to the present participle ("Saving").
  - Filled buttons (`primary`, `secondary`, `accent`, `destructive`): the band sits above the content in white with `mix-blend-mode: difference`, so it inverts what it crosses. On the fill it reads as dots, 1px at its edges and 2px in its core; on the label and icon it cuts them into the same dots.
  - `ghost` and `danger-ghost`: there is no fill to blend with, so the band masks the content instead: 1px holes at its edges, 2px dots of the label and icon in its core. Outside the band the content is whole.
  - `link`: the inline Spinner leads the label, since there is no box to sweep.
  - Hand-written markup wraps the content in `.ifs-btn__body` so ghost buttons have something to mask.
- `selected`: a pressed toggle (`aria-pressed`).

## Rules

- One primary per view. A dialog's primary repeats the dialog's verb: "Add secret" closes "Add secret".
- Keep disabled buttons rare. Prefer an enabled button that explains what is missing.
- Never put two accent buttons side by side.
