# CodeBlock

Code in Infisical's framed container, with an opinionated header: a mono label on the left, actions on the right, Copy always last. The tint shell carries the header; the code sits in the inset `surface` with its `line` border and `shadow-raised`, like a framed Card.

## You provide

- `code` (a string) and `language`, plus any Code block option: `lineNumbers`, `highlight`, `wrap`, `maxLines` or `maxHeight`.
- Or `children`: another view for the body, such as a `Json`. With a Json child, Copy copies its pretty-printed value, with `redact` applied.
- `label`: a file name (`k8s/payments/infisical-secret.yaml`), a language, or "Terminal". Strings middle-truncate and keep their last 12 characters, so the file name survives. Defaults to the language.
- `icon`: `terminal` for commands, `file` for files.
- `actions`: extra buttons before Copy. Use `Button variant="ghost" size="sm"`, icon-only with a Tooltip (Download) or a short label ("Expand all"); the header sizes them to 28px.
- `copy={false}` to drop Copy, `copyValue` to copy something other than what shows, `copyLabel`, `onCopy`.

## Rules

- Copy is always there and always last. It copies the source, never line numbers or prompts, and says "Copied" for 1.2s, to screen readers too.
- One or two extra actions at most. Anything more belongs next to the block, not in it.
- Labels are mono and never uppercase: file names and languages are case-sensitive.
- Commands wrap (`wrap`); files scroll sideways and show line numbers once they pass about 10 lines.
- Limit tall blocks with `maxLines` so a page keeps its rhythm; the scroller fades the edge with more code.
