# PageHeader

> **v4 status:** Not yet implemented. These guidelines describe the target behavior.

The top of a page, with the page-level breadcrumb: the trail above the title, the title in `display` with its badges, a `body-lg` lede in `muted`, actions on the right and tabs under everything.

## You provide

- `title`, `mono` for keys, paths and hosts, and `size`: `lg` (default, `display` 44/44) for top-level pages, `md` (28/32, mono 24) for one object's page.
- `breadcrumb`: crumbs (or your own element). The eyebrow form by default ("PAYMENTS / STRIPE"); `breadcrumbVariant="default"` with `separator="chevron"` and `maxItems` for a folder path that collapses its middle into a "…" button. Every crumb is an ancestor: the title follows, so it is never repeated as the last crumb.
- `badges` beside the title (environment, status, version), `description` (the lede, one or two sentences), `actions` (primary last), `tabs` (underline Tabs for the page's sections), `media` (a 40px lead for an object's page).

## Layout

The breadcrumb sits 8px above the title; the lede 10px under it (8px at `md`). Actions are default-size buttons 8px apart, centered on the title's first line. The title keeps `size-text-min` (160px), and the actions drop under the text when both cannot share a line. Tabs sit 24px below. Titles wrap; they never truncate.

## Rules

- One PageHeader per page, one `h1`.
- The lede says what needs attention with a count ("3 are missing in production"), not what the page is.
- At most one primary action. Everything else is secondary or in a menu.
- The product-level breadcrumb (organization, project, environment) belongs in the TopBar; this one holds what is inside the page's area. Never start the eyebrow with the organization, since it is already the TopBar's root crumb. A top-level page with no trail inside its area has no eyebrow; the title starts the content.
