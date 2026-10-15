# InputGroup

An input with something attached: a leading icon or text, a trailing unit, a shortcut hint, a copy button, or a button joined to its edge.

## You provide

- Native input props, plus `mono`, `size`, `invalid` like Input.
- `prefix` / `suffix`: short text on a tint addon ("https://", "days"). Can be any small node.
- `icon`: a leading icon. `kbd`: a trailing shortcut, drawn as a small Kbd. With `copyValue` too, the hint and the copy button form one group of nested items, 4px apart.
- `copyValue`: shows a copy button that copies this string (use with `readOnly` for tokens and paths). A field that exists only to be copied, such as a command or a URL, is a Snippet.
- `action`: a Button element joined to the right edge ("Generate", "Test connection").

## Rules

- One addon per side. If it needs more, it is a form, not a group.
- Suffixes name units, never instructions.
- The joined action works on the value in the box, nothing else.
