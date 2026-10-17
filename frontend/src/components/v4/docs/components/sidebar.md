# Sidebar

> **v4 status:** Partly implemented. The base is [`ui/sidebar.tsx`](../../ui/sidebar.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#sidebar`. The Infisical composite described here (tools row, spaces, account button, rail, Switcher) is not yet implemented on top of it.

The app's navigation, beside the inset: a tools row (collapse, search, invite), a switch between spaces (Home, Organization), sections of nav rows, footer rows, and one account button that holds both you and the organization, on `sidebar` with a 1px `sidebar-line` on its right edge. It is 224px wide and collapses to a 53px rail of icons. The current page is neutral; only counts take the accent.

## You provide

- `sections`: `[{ label?, items }]`. The first section usually has no label (Home, Needs you); the rest take a muted eyebrow ("Products") with a rule to the sidebar's edge.
- Or `spaces`: `[{ id, label, icon, sections }]` in place of `sections`, with `space` / `onSpaceChange` (or `defaultSpace`) and `spacesLabel` ("Navigation"). See Spaces.
- Nav items: `{ id, label, icon, href | onClick, count?, badge?, external?, children?, defaultOpen?, disabled? }`. `count` is an accent Count at the row's end. `children` is one level of pages under the row, which opens and closes them on a guide under its icon; its group opens by itself when it holds the current page. A closed group shows its pages' counts added up, so a count is never hidden inside it.
- `current` (the id of the page you are on) and `onNavigate(item, event)`.
- `search`: `{ onClick, label?, shortcut? }`, an icon button in the tools row that opens the CommandMenu; its tooltip shows the shortcut (`mod+K` by default). `invite`: `{ onClick, label? }`, an icon button beside it ("Invite members" by default, the `user-plus` icon). Either can be your own element, or `false`.
- `user`: `{ name, email, initials?, items, href | onClick, settingsLabel? }` and `org`: `{ name, plan, options, value, onChange, actions, optionsLabel?, media? }`. Together they make the account button at the bottom: your avatar, your name and the organization's name. With only `user` it shows you and your email; with only `org`, the organization's name and its plan, with no lead. `media` replaces your avatar; it never takes an organization avatar, because organizations have none. `href` or `onClick` makes you, at the foot of the popover, the row that opens your settings ("Personal settings", `settingsLabel`).
- `theme`: `{ value, onChange, label? }`, with `value` one of `light`, `dark`, `system`: a theme picker in a row of the account popover.
- `footerItems` above the account ("What's new" with its count, "Docs" with `external`).
- `collapsed` / `onCollapsedChange` (or `defaultCollapsed`); `collapsible={false}` drops the toggle. `header` puts your own node above the tools row.
- `edge={false}` drops the 1px `sidebar-line` on the right edge, for a shell whose inset draws its own border beside the sidebar (a framed inset); the rail is then 52px.

## Spaces

- With `spaces`, the nav shows one space at a time: Home (the products) or Organization (integrations, access, audit logs, billing, settings). A segmented switch under the tools row picks it, in even segments across the sidebar, on a `sidebar-hover` track with the `surface` thumb.
- The space holding the current page shows by default, and a page opened from elsewhere (the command menu, a link) brings its space with it. Switching only changes what the nav lists; the page stays until you pick a row.
- A space that is not showing but holds a count gets a 6px `accent-fg` dot after its label, and screen readers hear "has updates", so nothing waiting on you hides behind the switch.
- In the rail the switch is a 36px pill of the spaces' icons stacked under the tools (Home `apps`, Organization `building`), the shown one on the `surface` thumb, each with a tooltip; the dot moves to the icon's corner.
- The nav landmark takes the space's name ("Home navigation"). The switch is a tablist: Left and Right (Up and Down in the rail) move between spaces.

## Layout

- The column has no padding of its own. Each section pads itself, and every padding and gap is 8px: the tools row 8px 8px 0, the nav and footer rows 0 8px, the account 8px on every side; 8px between the tools, between the tools row, the nav and the footer, between nav sections, and on both sides of the rule above the account. So that rule runs the sidebar's full width, and so do the rail's section rules, with 8px above and below them.
- Inside the rows the geometry is the rows' own: rows stack 1px apart, icons sit 9px in with labels 10px after them, children 28px in.

## The tools row

- 36px: the collapse toggle at the start, then search and invite at the end, 8px apart. They are 36px icon buttons with 18px icons, like the rows under them, `text2` at rest, `sidebar-hover` and ink on hover. Each has a tooltip that floats below it.
- The toggle sits at the same spot on screen in both widths, 8px from the top and the side. In the rail the tools stack under it, 1px apart like rows, and their tooltips float to the right.

## The account button

- A 36px row like the nav rows, built on `Identity` (the Item layout with an avatar lead): your 20px person avatar 8px in on every side, so its center is on the nav icons' line, your name (13.5px, 600) over the organization (12px, `muted`), lined up with the nav labels, and a `chev-ud` ending 9px in like the rows' trailing icons. In the rail only your avatar shows, in the same spot.

## The account popover

One `Switcher` for both, opening upward (to the right in the rail), 264px wide and floating out of the sidebar. Top to bottom, so you end up next to the button you opened it from:

- The organizations under an "Organizations" label (`optionsLabel`), each as its name with its plan as meta and a check on the one you are in. Organization rows have no avatar or icon. A search row appears over them with more than seven.
- The organization's `actions` after a rule ("Create organization"), then a rule and your `items` ("Sign out"). Organization settings belong in the sidebar's Organization space, not here.
- The footer, on a rule: the theme row (`theme`), "Theme" on the left and three 28 by 24 icon radios on a `tint` track on the right, Light (`sun`), Dark (`moon`) and System (`monitor`), each with a tooltip; then, on a rule, you: an `Identity` with your 28px avatar, name and email and a chevron, the row that opens your settings. It replaces a separate Profile or Personal settings item.
- Picking an organization calls `onChange` and closes it; focus goes back to the button. Up and Down move through the list, Enter picks, Tab goes on to the theme radios (Left and Right change the theme) and your row, and Tab past either end or Escape closes it, with focus back on the button.

## States

- Rows are 36px (`size-control-md`), children 32px, 18px icons 9px in, labels `text2` at 14px. Hover is `sidebar-hover`. The current page is `sidebar-current` with ink text at 600: ink at the press step over the sidebar, one step past hover (#D9D8D3 in light, #2C2C2B in dark). No accent and no edge. The group holding it keeps its label in ink.
- Counts are accent Counts with `on-accent` numbers and no edge, on every row including the current one: the number carries the contrast, the yellow says it is waiting on you.
- The rail: icons only, each with a tooltip that floats out of the sidebar; a group opens its pages in a flyout to the right, where the current page is ink at the press step over the flyout; section labels turn into rules that run edge to edge, and counts into a 6px dot ringed in the row's ground. The dot has no number, so it is `accent-fg`: ink in light, where a bare yellow dot would vanish, and the accent in dark. The group holding the current page takes `sidebar-current`. The account button shows only your avatar. Width eases over the slide curve; reduced motion jumps.
- Up and Down move between rows, Home and End jump. Focus draws the 2px ink outline inside the row, so the scroller never clips it. The nav scrolls when it runs out of room, fading the edge with more rows.

## Switcher

The account popover is a `Switcher`, and so is every switching crumb in a product Breadcrumb: a listbox popover with a search row when there are more than seven options (`searchable`), options with an optional 20px lead (a Media tile for a project; never one for an organization), their meta and a check on the current one, groups, then `actions` after a rule ("Create organization"). Actions can be grouped with `{ type: 'separator' }` and `{ type: 'label', label }` entries, `header` puts a block above everything on a rule, and `footer` (a node, or a function given `{ close }`) puts controls under the list on a rule, reached with Tab. Rows follow the menu geometry, so their text lines up 11px from the edge. It floats out of anything that clips it. Pass any button as `trigger`.

A Switcher opened from a breadcrumb crumb anchors to the whole crumb segment. The segment never highlights; only its chevron does, and clicking anywhere on the segment opens the Switcher. The full trigger rules are in [Breadcrumb](breadcrumb.md).

## AppTile

`AppTile` is the app tile: the ink mark at 20 by 10 on a 28px `accent` square, `radius-control` corners when corners are on. It is the only place the accent and the mark meet. The Sidebar no longer shows it; pass it in `header` if a surface needs the brand.

## Rules

- Labels are nouns, one or two words. Put the page's own name in its PageHeader, not a longer sidebar label.
- At most one level of children. Deeper structure belongs in the page, as tabs or a tree.
- Counts are things waiting on the person (approvals, requests), never totals.
- Keep the toggle, search and invite at the top and the account at the bottom. The organization's name is the TopBar's root crumb, with its own switcher; the account popover can list organizations too.
- Organizations have no avatar or icon anywhere: not on the account button, not in the popover, not in a crumb.
- Two spaces at most in the switch, named for where you are (Home, Organization), never for a product. A product's own pages are children of its row.
- Give each thing one way in from the popover: no item that repeats a sidebar row (Organization settings) or another item (Profile beside Personal settings).
- Where you are is neutral. The accent marks what is waiting on you: counts in the sidebar, approval moments in the page.
