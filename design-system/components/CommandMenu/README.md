# CommandMenu

Global navigation and search, opened with `mod+K` from any page: a search row, results grouped under eyebrows that filter and rank as you type, pages to drill into, and a footer of key hints. It is a 600px dialog near the top of the page on `scrim`, so the page stays in view under it.

## You provide

- `groups`: `[{ label, items, meta?, limit?, searchOnly? }]`. Groups keep their order; items rank inside their group, label matches first (at the start, then at a word start after a space, `_`, `-`, `.`, `/` or `:`). `limit` caps a group while searching; `searchOnly` hides it until there is a query (secrets, members).
- Items: `{ id, label, icon | media, description?, meta?, shortcut?, keywords?, mono?, href | onSelect, page?, danger?, disabled?, keepOpen? }`. A string `label` has its match marked in the accent. `description` runs muted after the label; `meta` ends the row ("Secret", "412 secrets"); `shortcut` shows the Kbd the app binds; `keywords` find the item by other words ("pki" for Certificates).
- `recent`: items shown first, under "Recent", while the search is empty.
- `pages`: `{ [id]: { title, placeholder, groups } }`. An item with `page` opens one ("Switch organization"): its title shows as a crumb in the search row, and Backspace on an empty search, Escape or the back button returns.
- `open` / `onOpenChange` (or `defaultOpen`). `hotkey` (default `mod+k`, `false` for none) toggles it from anywhere.
- Search elsewhere: `onQueryChange(query, pageId)` tells you every change; pass the results back in `groups` and set `loading` while they come, which shows the inline Spinner in the search row, and a "Searching" row while nothing is there yet. `filter={false}` shows results as given.
- `emptyHint` under "No results for “query”." (say what can be searched), `footer` for quiet context at the footer's end (the project you are in), `inline` to render the panel in place (docs, an empty home page).
- `SearchTrigger` opens it: a 32px button in a field's clothes with the search icon, a muted label and the shortcut, or `compact`, icon only. The TopBar uses it; the Sidebar opens the menu from a search icon button in its tools row, with the shortcut in its tooltip.

## Keyboard

Up and Down (or Ctrl+N and Ctrl+P) move through every enabled row, wrapping at the ends; the active row takes its own color at `opacity-hover` and scrolls into view. Enter opens it; `mod+Enter` opens a link in a new tab. Escape goes back from a page, then closes. Focus starts in the search and stays in the dialog; it returns to what opened it.

## Rules

- Group by what people look for: pages, then objects (projects, secrets, members), then actions. Put the object groups behind `searchOnly` when they are long.
- Labels are the names people type: page names, keys in mono, project slugs. Put the qualifier in `description` ("production"), not in the label.
- Actions start with a verb, like buttons: "Add secret", "Invite member", "Rotate a secret".
- Show a shortcut only when the app binds it, written with `mod`.
- Keep results server-side for anything with more than a few hundred rows; the menu matches what it is given.
