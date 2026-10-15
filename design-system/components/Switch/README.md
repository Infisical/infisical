# Switch

Turns a setting on or off right away. On is an ink track with a yellow knob in light, and a yellow track with a black knob in dark.

## You provide

- `checked` and `onChange(next)`, or `defaultChecked`.
- `label` and `description`. `layout="row"` puts the text on the left and the switch on the right, with a soft rule between rows: the settings pattern.
- `size="sm"` (28 by 16) inside tables and dense lists.
- `disabled`; without a label, `aria-label`.

## Rules

- The change applies immediately and says so with a Toast when it matters ("Auto-renew is on for vault.internal").
- Never pair a Switch with a Save button; that is a Checkbox.
- Labels name the setting, not the action: "Require approval for production".
