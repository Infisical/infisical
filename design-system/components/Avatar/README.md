# Avatar

Shows who or what acted. People get initials on ink, machines a server glyph on tint, agents a robot glyph on the accent, so the three kinds read apart at a glance.

## You provide

- `kind`: `person` (default), `org`, `machine`, `agent`, `fallback` (unknown person).
- `name` (initials are derived and it becomes the accessible label) or `initials` plus `label`.
- `size` in px: 20 in dense rows, 22 to 24 in tables and lists, 32 by default, 40 in headers.
- `status`: `ok`, `warn` or `off` presence dot. `ring` when overlapping.

`AvatarGroup` overlaps its children and shows `+N` past `max`. `Identity` is an Item with an avatar as its lead: a name and one line under it; pass `mono` for machine and agent names. `media` and `title` replace the avatar and the name (the Sidebar's account button: the organization's avatar beside your name). In a list of people, use List rows with an Avatar as `media` instead.

## Rules

- Machine and agent names are mono (`github-actions`, `on-call-agent`); people's names are not.
- Never use photos in product UI; initials keep lists calm and private.
