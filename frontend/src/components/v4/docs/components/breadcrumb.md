# Breadcrumb

> **v4 status:** Partly implemented. The base is [`ui/breadcrumb.tsx`](../../ui/breadcrumb.tsx), a shadcn Radix primitive restyled by `v4.css`. Preview it at `/design-system#breadcrumb`. The `product` and `eyebrow` variants and switching crumbs are not yet implemented.

Shows where a page sits: organization, project, environment, path. Ancestors are `text2` links; the current page is ink at 600 and not a link.

## You provide

- `items`: `[{ label, href?, onClick?, mono?, media?, menu? }]`, root first. The last item is the current page. `label` can be a node (an environment Badge).
- `separator`: `slash` (default) for org and project, `chevron` for folder paths.
- `maxItems`: collapses the middle into a "…" button that expands in place.
- `variant="eyebrow"`: the uppercase muted form above a page title ("ACME CORP / ACME-PLATFORM").
- `variant="product"`: the product's levels in a TopBar, with the organization's name as the root. A project may take a 20px `media` lead (a Media tile with its initials); the organization never does, since organizations have no avatar or icon anywhere. Labels truncate before anything wraps.
- `menu` on any crumb: it becomes a switching segment (see Switching crumbs) that opens a Switcher (`options`, `value`, `onChange`, `actions`) listing its siblings. Product crumbs use it for the organization, project and environment.
- `menuTrigger`: `segment` (default), where a click anywhere on the segment opens the Switcher, or `chevron`, for a crumb whose label must stay a link to its own page. Then the label is an `href` that hovers with an underline, never a ground, and only the chevron opens the Switcher.
- `current={false}`: every crumb is an ancestor, for trails whose page title follows them (PageHeader passes it).

## Switching crumbs

Each crumb with a `menu` is one segment: an optional lead, the label, then a standalone chevron button.

- **The chevron is the only element that highlights.** The segment never draws a ground, at rest, on hover, pressed or open. Hovering anywhere on the segment, text included, gives the chevron the hover ground (ink at `opacity-hover`) and turns it ink. Pressing the segment, or having the Switcher open (`aria-expanded="true"`), gives the chevron the press ground (ink at `opacity-press`).
- **Clicking anywhere on the segment opens it.** The segment has `cursor: pointer` and takes pointer clicks, so the label, the lead and the chevron all open the same Switcher. There is never a second trigger.
- **The chevron is the one tab stop.** It carries `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls` and a name that holds the label ("Switch organization, Acme Corp"). The label and the lead are `aria-hidden`, since the chevron's name carries them. Focus is a 2px ink outline, 2px out, on the chevron only.
- **Keyboard**: Tab reaches each chevron. Enter, Space or ArrowDown opens the list. Up and Down move, Enter picks, and Escape closes it with focus back on the chevron.
- **Geometry**: the segment has no horizontal padding, so the label's first glyph is the crumb's edge. The chevron is 24px square, 4px after the label, and crumbs are 8px apart around the separator. The Switcher anchors to the whole segment, so its left edge sits on the content edge too.

## Levels

- Product level, in the TopBar: organization / project / environment / page, each switching. The organization's name is always the root. See TopBar.
- Page level, in the PageHeader: the eyebrow over a top-level page, or the folder path above a folder or an object. See PageHeader.

## Rules

- Mono for paths, slugs and keys; sentence case for named things.
- Never repeat the page title as the last crumb in the eyebrow form; the title follows it.
- Never repeat the organization in the eyebrow form; it is already the TopBar's root crumb.
- The root crumb's text lines up with the page's content edge through the shared page gutter. See TopBar.
