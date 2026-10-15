# Code

Machine text. Inline by default: a mono chip on `line-soft` inside a sentence, for commands, keys and paths people type or recognize. With `block`, the bare code view that CodeBlock frames: numbered lines, highlighted lines and neutral syntax highlighting.

## You provide

- Inline: the text as `children`.
- `block`: `code` (a string, or `children`), `language`, and optionally `lineNumbers`, `highlight` (1-based line numbers), `wrap`, `maxLines` (or `maxHeight`), `aria-label`.
- Languages: `bash` (also `sh`, `shell`, `terminal`), `env` (`.env`, `dotenv`), `json`, `yaml`, `js` (also `ts`, `jsx`, `tsx`), `python`, `hcl` (Terraform). Anything else shows as plain text.

## Highlighting

- Neutral, like the rest of the system: commands, keywords and keys in `ink` at 600; numbers, booleans, flags and variables in `ink` at 500; strings and values in `text2`; punctuation and comments in `muted`. Hue is saved for meaning.
- In shell, the first word of a line, or after a pipe, `&&`, `;` or `--`, is the command. In `.env` and YAML, everything after the key's `=` or `:` is the value.

## Behavior

- Block code is 12.5/20 Geist Mono, padded 12px by 14px. Long lines scroll sideways; `wrap` breaks them at spaces (never inside a flag, variable or key) and hangs continuation lines 2ch in.
- Line numbers are a CSS counter, so selecting and copying the code never picks them up.
- Highlighted lines take `accent-wash`, the highlighted-row ground, with no edge bar.
- With a height limit the view scrolls, and each edge with more code past it fades over 32px, like an overflowing tablist.
- The block is focusable so keyboard users can scroll it; focus draws the 2px ink outline inside its edge.

## Rules

- Inline code is for text someone types or recognizes: `infisical login`, `STRIPE_WEBHOOK_SECRET`, `/payments`. Names of people and products stay in the sans.
- Put blocks in a CodeBlock unless you are building your own frame.
- Never put a real secret value in code. Use a placeholder, a variable (`$INFISICAL_TOKEN`) or a reference.
