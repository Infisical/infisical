# ActivityLog

> **v4 status:** Pattern, not yet implemented. It composes List and Item rows rather than being a component of its own.

A pattern, not a component: who did what, one line per event, grouped by day. A plain List of `sm` Items with sections and load more.

## Built from

- `List` with `variant="plain"`, `size="sm"`, a `label`, and a `footer` holding the load more Button (or "Showing 9 of 9 events" once everything is in).
- A `ListSection` per day, its `meta` counting the events.
- One `Item` per event: the actor's Avatar at 24 as `media`, the actor and what happened as the `title` (keys and machine names in mono), the kind of actor as a small `badge`, the time as `meta`.

## States

- Loading more: `loading` on the List adds skeleton rows under the rows already there while the Button shows `loading`.

## Rules

- Past tense, actor first: "Sarah Lin updated `stripe_api_key`".
- Times are short and local; the section says the day.
- For filtering, sorting or exporting events, use a Table (the audit log).

