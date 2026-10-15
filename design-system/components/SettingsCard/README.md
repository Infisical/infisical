# SettingsCard

One setting, or a few that save together: a plain card whose title and description say what it controls, the fields in its content, and a `paper` footer shelf with the status on the left and Save on the right.

## You provide

- `title` (the setting, a noun: "Project name"), `description` (what it affects), `action` beside the title (a badge such as "Admins", a docs link).
- `children`: Fields (capped at 480px), `Switch layout="row"` rows and horizontal Fields (split by `line-soft` rules), a Snippet for a read-only value.
- `dirty`: whether anything differs from what is saved. You keep the values; compare them to the saved ones.
- `onSave`: runs from Save or Enter in a field. Return a promise to show "Saving" then "Saved"; reject it with an Error whose message says what failed and what to do. `onDiscard` puts the saved values back.
- `hint`: the footer's line while nothing changed (a limit, what the change breaks).
- `locked`: read-only, with the reason as the footer's line ("Only organization admins can change retention. Ask Sarah Lin."). Fields look read-only and there are no buttons.
- `loading` for skeleton fields, `saveLabel` when Save should name the object ("Change slug"), `tone="danger"` with your own `actions` for destructive settings.

## The footer

Left, one status at a time: the hint; "Unsaved changes" behind a 6px `warn` mark (the dirty cells of a DataGrid use the same warn); "Saving" with the inline Spinner; "Saved" with `check-c` in `ok` for a few seconds; what failed, in `bad`; or the lock and the reason. Right: Discard (ghost, only while there are changes) and Save (primary, disabled until something changed, busy while it saves), small buttons 12px apart. The shelf pads 12px, its text on the content's 18px line.

## Rules

- One card per decision someone makes at once. Settings that save separately get separate cards.
- Put field errors on the Field and the reason in the footer. Keep what was typed.
- Settings that apply instantly (a Switch with no Save) do not need this card: use a plain card, and confirm with a Toast.
- Danger cards come last on the page, with `bad-line` and a `bad-wash` footer, and their action opens an AlertDialog that names the object.
