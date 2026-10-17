# TopBar

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

The strip across the top of the inset with the product-level breadcrumb: the organization, project and environment you are in on the left, each a switching crumb, and page-wide tools on the right. It is 48px tall on a `line-soft` rule, on the `inset` ground.

## You provide

- `breadcrumb`: crumbs for a product Breadcrumb, root first. `{ label, mono?, media?, menu? }`: `media` is a 20px lead for a project (a Media tile with its initials); the organization crumb never has one. `menu` makes the crumb a switching segment that opens a Switcher (`options`, `value`, `onChange`, `actions`, `placeholder`). See Breadcrumb. The last crumb is the product area you are in ("Secrets"), plain text.
- `actions`: a SearchTrigger that opens the CommandMenu, icon buttons with Tooltips (notifications), the account's DropdownMenu.
- The page gutter: the bar pads by the same gutter variable the page content pads by, set once on the inset (for example `max(40px, calc((100% - 1328px) / 2))`). Both resolve against the inset, so they cannot drift apart. There is no 8px offset, because crumb segments have no horizontal padding.

## Alignment

The breadcrumb root's text, the page title and the content's left edge sit on one line at every width. That holds only when the bar and the page read one shared page gutter; two sources of width (a capped, centered page beside a bar with a fixed pad) drift apart as the window grows. The bar's right side uses the same gutter, so its last tool ends on the content's right edge. The system should ship that gutter as a shared variable or a `PageContainer` so pages stop computing it themselves; neither exists in v4 yet.

## Levels

- Organization / project / environment / page, with or without the Sidebar. The organization's name is always the root.
- Ancestors are `text2`, the current level ink at 600. Switching crumbs end in a muted chevron button, and only that chevron highlights (see Breadcrumb).

## Overflow

It gives way from the outside in, so the level you act on stays readable: labels truncate first (with their full text in the switcher); under 620px the search keeps only its icon; under 520px the page crumb goes, since the page title says it; under 400px every switcher but the deepest keeps only its lead (or its chevron, when it has no lead), and the organization goes when a project follows it. Hidden labels stay for screen readers.

## Rules

- One product breadcrumb per page, in the top bar. The page-level trail (folders, an object's parents) belongs in the PageHeader.
- Put environments last: they change most often and matter most in production.
- Keep the right side to three or four tools.
