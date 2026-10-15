# Breadcrumb

Shows where a page sits: organization, project, environment, path. Ancestors are `text2` links; the current page is ink at 600 and not a link.

## You provide

- `items`: `[{ label, href?, onClick?, mono?, media?, menu? }]`, root first. The last item is the current page. `label` can be a node (an environment Badge).
- `separator`: `slash` (default) for org and project, `chevron` for folder paths.
- `maxItems`: collapses the middle into a "…" button that expands in place.
- `variant="eyebrow"`: the uppercase muted form above a page title ("ACME CORP / ACME-PLATFORM").
- `variant="product"`: the product's levels in a TopBar. Crumbs are 32px targets that hover in their own color, with a 20px `media` lead (an Avatar `kind="org"`, a Media tile); labels truncate before anything wraps.
- `menu` on any crumb: it becomes a Switcher (`options`, `value`, `onChange`, `actions`), its label and a muted chevron opening the list of its siblings. Product crumbs use it for the organization, project and environment.
- `current={false}`: every crumb is an ancestor, for trails whose page title follows them (PageHeader passes it).

## Levels

- Product level, in the TopBar: organization / project / environment / page, each switching. See TopBar.
- Page level, in the PageHeader: the eyebrow over a top-level page, or the folder path above a folder or an object. See PageHeader.

## Rules

- Mono for paths, slugs and keys; sentence case for named things.
- Never repeat the page title as the last crumb in the eyebrow form; the title follows it.
