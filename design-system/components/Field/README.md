# Field

Wraps one control with its label, then either help text or an error, never both. It wires `id`, `htmlFor`, `aria-describedby` and the invalid state into Input, SecretInput, InputGroup, Select and Combobox for you.

## You provide

- `label`: a noun, sentence case, no colon ("Secret key", "Rotation interval").
- `children`: one control. For a group of Checkboxes or Switches, pass `group` so the label names the group.
- `description`: one line that prevents the error ("Uppercase letters, numbers and underscores").
- `error`: what is wrong and how to fix it ("Enter a number from 1 to 365"). Replaces the description while shown.
- `optional`: marks the rare optional field. Required is the default and is not marked.
- `orientation="horizontal"`: label and help on the left, control on the right, for settings pages.

## Rules

- Label above the control, 6px apart (`space-6`); fields 16px apart (`space-16`).
- Validate on blur or submit, not on every keystroke.
- Error text is `bad` with the alert icon, so it never relies on red alone.
