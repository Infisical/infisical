# TopBar

The strip across the top of the inset with the product-level breadcrumb: the organization, project and environment you are in on the left, each a switcher, and page-wide tools on the right. It is 48px tall on a `line-soft` rule, on the `inset` ground.

## You provide

- `breadcrumb`: crumbs for a product Breadcrumb, root first. `{ label, mono?, media?, menu? }`: `media` is a 20px lead (an Avatar `kind="org"`, a Media tile with the project's initials), `menu` makes the crumb a Switcher (`options`, `value`, `onChange`, `actions`, `placeholder`). The last crumb is the product area you are in ("Secrets"), plain text.
- `actions`: a SearchTrigger that opens the CommandMenu, icon buttons with Tooltips (notifications), the account's DropdownMenu.
- `--ifs-inset-pad` on an ancestor: the inset's side padding (default 40px). The bar pads 8px less, so the first crumb's text sits on the page title's line.

## Levels

- With no sidebar: organization / project / environment / page.
- Beside the Sidebar, which already holds the organization: project / environment / page.
- Ancestors are `text2`, the current level ink at 600; switchers end in a muted `chev-ud`. Crumbs are 32px targets padded 8px that hover in their own color at `opacity-hover`.

## Overflow

It gives way from the outside in, so the level you act on stays readable: labels truncate first (with their full text in the switcher); under 620px the search keeps only its icon; under 520px the organization keeps only its avatar and the page crumb goes, since the page title says it; under 400px every switcher but the deepest keeps only its lead, and the organization goes when a project follows it. Hidden labels stay for screen readers.

## Rules

- One product breadcrumb per page, in the top bar. The page-level trail (folders, an object's parents) belongs in the PageHeader.
- Put environments last: they change most often and matter most in production.
- Keep the right side to three or four tools.
