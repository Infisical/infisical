# Item

The layout of one object: a lead, then text whose first line holds the title, a badge and the meta, then the actions. Item owns spacing, alignment and overflow, and never draws a box; List, Card, Tile and Identity put it in theirs.

## Slots

- `icon` (a 40px Media tile, 24px at `sm`, on the `tint` ground with no border; `tone` tints it `ok`, `warn`, `bad` or `info`) or `media` (an Avatar, a Media tile, anything square).
- `title`: the object, in mono when it is a key or host. `badge` sits right after it.
- `meta`: quiet facts at the end of the title line: a time (a string renders mono `muted`), a count, a status badge.
- `description`: one line under the title. `error`: a `bad` line with an icon, for the last action on this object that failed. `children`: a body under the text (a Progress bar, a code snippet).
- `actions`: the two things someone would do next, small buttons, primary on the right.
- `actionsPlacement`: `end` (default) puts the actions beside the text, under it when they cannot share a line. `below` always gives them their own row under the text, left aligned with it, at every width: the text takes the full width, so the meta ends every row's first line, and the actions keep one place. Use it when a row's buttons change with its state (a queue of requests), and put the way back (Undo, Revoke) and Retry in the same row. Inside a List, set it on the List. Ignored at `sm`.
- `unread`: the title steps up to 600 behind a 6px `accent-fg` mark; screen readers hear "Unread".
- `size`: `md` (default) or `sm`, one line around 24px media with no description. Inside a List, Items take the list's size.
- `truncate={false}` lets the title and description wrap instead of truncating (Card's plain header uses it).

Behavior props (`href`, `onClick`, `current`, `value`, `disabled`, `selectable`, `resolved`) come alive inside a List; see List. Earlier names still work: `trail` is `meta`, `selected` is `current`, `variant="compact"` is `size="sm"`, and a compact Item's children are its badge.

## Overflow

Items handle a narrow container the way tables do: nothing squeezes past its floor, and truncated text shows in full on hover.

- The text keeps `size-text-min` (160px). The lead, badge, meta and buttons keep their width.
- The meta ends the title line: the title truncates before it, and the description runs on under it.
- Actions that do not fit beside the text drop under it, left aligned with it; rows that fit stay on one line, so a list can mix both. They wrap among themselves only when the row is narrower than all of them. With `actionsPlacement="below"` they are always under the text, so every row has the same shape at every width.
- Put the words that tell rows apart first ("`stripe_api_key` changed in production"), so the ellipsis takes the least useful ones.
- `sm` never wraps: the title truncates first.

## Where it lives

- A List row (the common case).
- Card's plain header: media, title, description, and the card's `action` as meta; the title wraps beside the badge.
- Tile: an Item inside a bordered button, the chevron or check at its end.
- Identity: an Avatar with a name and one line.
- On its own, inside any box that pads it: a card body, a popover header.

## Rules

- One object per Item. Two objects side by side are two Items.
- Status travels with a word or its icon: tone the icon tile, or put a status badge in `meta`; never tint the row.
- Everything else goes in a DropdownMenu at the end of `actions`.

