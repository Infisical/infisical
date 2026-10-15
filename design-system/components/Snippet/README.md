# Snippet

One line to copy, such as a command, a URL or an ID. It behaves like a read-only input: a `tint` field with a `line` border and mono text, which you can select and scroll with the caret, with a Copy button at its end.

## You provide

- `value`: the text.
- `prompt`: a muted marker before the value, usually `$` for shell commands. It is never selected or copied.
- `size="sm"` (32px); `copyable={false}`; `copyLabel` (default "Copy"); `onCopy`.
- Inside a Field it takes the label and description like any input. Outside one, pass `aria-label`.

## Behavior

- A long value ends in an ellipsis until the field is focused, then scrolls under the caret.
- Focus looks like any text field: an `ink` border and the 3px nudge outline.
- Copy swaps to a check and says "Copied" for 1.2s, to screen readers too.

## Rules

- One line only. Anything longer, or anything with more than one command, is a CodeBlock.
- Never a secret value: use SecretInput, which masks it and asks before revealing.
- Put the command people run exactly as they run it; no placeholder in angle brackets unless they must replace it.
