# Infisical 2.0 design system

Infisical 2.0 is a quiet, square interface for secrets, certificates and access. Ink on warm off-white, one accent (Infisical yellow), mono for anything a machine reads, and very little depth. Everything here is built so a busy engineer can see what needs them, act, and move on.

This folder is a standalone reference for the Infisical 2.0 visual language: the brand book below, the tokens, 51 components and 3 product patterns with usage guidelines and live previews, icons, logos and fonts. The app in `frontend/` does not use it yet. Today's UI follows [`DESIGN.md`](../DESIGN.md) (v3), so where the two disagree, this folder describes the new direction rather than the current product.

## Viewing it

The previews are fetched at runtime, so serve the folder over HTTP rather than opening the file directly:

```bash
npx serve design-system
```

Then open the printed URL. The gallery (`index.html`) shows every component grouped like the guidelines, with switches for the light and dark themes and for square or soft corners.

## What's here

| Path | What |
| --- | --- |
| `README.md` | This brand book: voice, color, type, shape, spacing, states, motion, icons and logo. |
| `tokens.json` | The source of truth for every token: colors per theme, type styles, spacing, sizes, radii, shadows, opacity. Each token has a usage note. |
| `tokens.css` | Generated from `tokens.json`. CSS custom properties, a class per type style, and the `@font-face` rules. |
| `components/<Name>/README.md` | Guidelines for one component: what it is for, what you provide, and its rules. |
| `components/<Name>/preview.html` | A live preview of that component and its states. Patterns (AccessList, ActivityLog, ApprovalQueue) compose components rather than being exports of their own. |
| `components/bundle.js`, `bundle.css`, `index.d.ts` | The reference React 18 implementation (on `window.Infisical`), its stylesheet, and its prop types. |
| `components/catalog.json` | Generated list of the previews for the gallery. |
| `assets/Icons`, `assets/Logos` | The 51 line icons as SVG path data, and the mark and wordmark in each ink. |
| `fonts/` | Archivo and Geist Mono (Latin, variable), with their licenses. |
| `scripts/build.mjs` | Regenerates `tokens.css` and `components/catalog.json`. |

## Changing it

Edit `tokens.json` or a component's folder, then regenerate:

```bash
node design-system/scripts/build.mjs
```

Never edit `tokens.css` or `catalog.json` by hand. The bundle is a reference implementation for the previews, not a package the frontend imports: porting a component into `frontend/src/components` means rebuilding it with the app's own stack, following its guidelines here.


## Content fundamentals

Write like a careful colleague in the same on-call rotation: short, specific, calm.

- **Sentence case everywhere**: titles, buttons, tabs, menu items, badges. "Add secret", never "Add Secret".
- **Buttons start with a verb and name the object**: "Approve", "Revoke access", "Grant for 1 hour", "Import from .env". A dialog's primary repeats its title: "Add secret" closes "Add secret".
- **Name the object, say what breaks**. "Delete `stripe_api_key`? This removes the secret from production and stops syncing it to Vercel and GitHub Actions. You can restore it from history for 30 days."
- **Say what happened, then what to do**. "Sync to Vercel failed. The Vercel token expired on Sep 23. Reconnect to resume syncing." Never "Error" or "Something went wrong".
- **Counts beat adjectives**. "4 items are waiting on you", "9 of 14", "412 of 500". Over a limit, say so: "10,400 of 10,000, over".
- **Past tense for what just happened, present for state**: "Secret saved", "Syncing 14 secrets", "Synced 10:30".
- **Offer undo instead of asking first**, unless the loss is permanent.
- **Second person, sparingly**: "You are working in `production`." No "we", no "please", no exclamation marks, no emoji.
- **No em dashes.** Use a period or a comma. En dashes are fine for ranges ("26–50 of 412").
- **Mono for machine text**: secret keys (`stripe_api_key`), paths (`/payments/stripe`), hosts (`vault.internal`), environment slugs (`prod`), versions (`v15`), machine and agent names (`github-actions`, `on-call-agent`). People and products stay in the sans: Sarah Lin, GitHub Actions. Commands and keys inside a sentence use inline Code; shortcuts use Kbd caps, written with `mod` so each platform sees its own keys (⌘K on a Mac, Ctrl K elsewhere).
- **Dates are short and local**: "Sep 24, 10:30", "Today, 10:30", "Tomorrow". Full ISO only in mono-sm metadata (`2026-09-24`).

## Visual foundations

### Color

Neutral first. Most of the screen is `surface` with `ink` text, `muted` for secondary lines, and hairlines in `line` and `line-soft`. Color is saved for meaning.

- **Sidebar and inset**: the app is a `sidebar` beside an `inset`, with no frame around either. Light mode is light all the way across: `sidebar` is `tint` (#F1F0EA) and `inset` is `surface`. Dark mode is dark all the way across: `sidebar` is `frame` (#010101) beside the dark `surface`. A 1px `sidebar-line` separates them, since the two grounds are only 1.1:1 apart. In the sidebar, labels are `text2`, group labels `muted` eyebrows, hover is `sidebar-hover`, and the current page is `sidebar-current` (ink at the press step over the sidebar, one step past hover) with ink text. Where you are is neutral and what is waiting on you is not: counts are accent Counts, and in the rail, where a count becomes a dot with no number, the dot is `accent-fg`. `frame-soft` stays the warm ground for embedded or docs surfaces that want a frame.
- **One accent, used for attention**. `accent` marks counts (in the sidebar and the bulk action bar), the on switch knob, search highlights and approval moments ("Grant for 1 hour"). The current page in navigation stays neutral. It is Infisical yellow in both themes: #E3EF59 in light and #E7F256 in dark. On light grounds a yellow fill is nearly as light as the ground (1.10:1 on the sidebar, 1.21:1 on `surface`) and it carries no edge: the fill is a highlight, and what it says is its `on-accent` text, 16.7:1 on the fill. The label identifies the button or the count, so the fill does not need to (WCAG non-text contrast asks for 3:1 only where a shape is what identifies a control). So a bare fill never carries meaning on its own: a count that becomes a dot uses `accent-fg`. It is a fill with `on-accent` text, never text on a light ground. Where the accent has to be text or an icon (toast actions, the production banner), use `accent-fg`: ink in light, the accent in dark. At most one accent button per view.
- **Primary actions are ink**, not accent: `ink` fill with `on-ink` text.
- **Status colors always travel with a word or an icon**: `ok` Synced, `warn` Expiring, `bad` Blocked, `info` Pending. Each family has a text color, a `-bg` fill for badges, a `-wash` ground and `-line` border for alerts, and a `-deep` title color. `ok` and `bad` also differ in lightness, so they read apart without hue.
- **Dark mirrors light**. `ink` becomes bone (#F1F0EA) on a near-black `surface`; the accent takes over `sw-on` and `mark`. Toasts follow the theme too: `surface` with a `line` border and `shadow-pop` in light, a raised gray in dark (`toast-*`). The production banner sits on `accent-wash` with an `accent-line` border, ink text and an `accent-fg` lock.
- **Contrast**: body text is at least 12:1 in both themes; `muted` is at least 6.4:1 on every ground it uses. Two source pairs sit under the floor and are kept exact: `control` borders (2.1:1 light, 2.0:1 dark), which turn `ink` on focus (9.6:1 against `control`) with a soft 3px nudge outline outside (`bad-control` is the same step for invalid fields, turning `bad` on focus), and `faint` (3.0:1 light), which is reserved for disabled text.

### Type

Two families. **Archivo** for everything a person reads, **Geist Mono** for everything a machine reads.

- Page titles in `display` (44/44, 500, -0.03em), one per page, with a `body-lg` lede in `muted` under it and an `eyebrow` breadcrumb above it.
- Section headings in `title` (18/26, 500, -0.02em). Card and empty-state titles in `title-sm` (16/22, 600).
- UI text is `body` (14/20). Labels and row titles are `label` (14/20, 600). Field labels are `small` at 600; help text is 12.5/18 `muted`.
- `eyebrow` (11/16, 500, +0.06em, uppercase, font-stretch 106%) for card headers, table headers, menu group labels and breadcrumb eyebrows. Always `muted`.
- Keys and values in `mono` (13/18, 500); versions, dates and shortcuts in `mono-sm` (12/16) in `muted`.
- Numbers that line up use tabular figures (`font-variant-numeric: tabular-nums`).
- Code blocks are Geist Mono at 12.5/20. Highlighting is neutral, never hue: commands, keywords and keys in `ink` at 600, literals in `ink` at 500, strings and values in `text2`, punctuation and comments in `muted`. Highlighted lines sit on `accent-wash`.
- Long machine values that must keep both ends (keys that differ only at the end, file names, hosts) middle-truncate with MiddleTruncate; prose truncates at the end.

### Shape

**Square by default.** Every radius token is multiplied by `corners`, which is `0`. Set `--corners: 1` on any container to get the soft variant: 2px on controls (`radius-control`), 3px on plain cards, alerts and toasts (`radius-card`), 4px on shells, frames and dialogs (`radius-panel`). A surface inset in a tint shell takes `radius-inset` (1px), the shell's radius minus its 3px gap, so nested corners stay concentric. Never set a radius directly; always `calc(var(--radius-*) * var(--corners))`. People avatars soften with corners on; machines and agents stay squarer, so the two kinds keep reading apart.

### Containers and depth

- **The nested container is the signature pattern**: a borderless `tint` shell, its header (an eyebrow and an optional link) inside the shell, around an inset `surface` with its own `line` border, inset by `space-3`, lifted by `shadow-raised`. Cards, tables and framed lists all use it. The shell never gets a border of its own; plain cards and compact lists, which have no shell, keep a `line` border.
- Depth is rare. Only inset surfaces get `shadow-raised`; only overlays (menus, listboxes, popovers, dialogs, sheets, toasts) get `shadow-pop`. Everything else is flat, separated by borders and space. A shadow only ever means depth, never a state.
- **Item, List, patterns**: one object's layout is an Item (a lead, a title line with its badge and meta, a description, actions); it never draws a box. A List gives Items their behavior: framed, plain or bare; link or button rows with one current row; multiple selection; sections, loading, empty and a footer. Card's plain header, Tile and Identity are Items in their own boxes. Product rows (the approval queue, the activity log, the access list) are patterns composed from List and Item, shown as pages under Patterns rather than components.
- **Composites** are components assembled from the primitives, with behavior of their own: the app shell (Sidebar, TopBar with the product-level breadcrumb, PageHeader with the page-level breadcrumb), CommandMenu and the Switcher, SettingsCard, FloatingActionBar, MultiStep and Announcements. They add no colors or sizes of their own; every ground, rule, height and curve is one the primitives use.
- Dialogs and sheets sit on `scrim`. Their footers are a `paper` shelf with a `line-soft` rule, padded `space-12`, with buttons `space-12` apart.

### Spacing and layout

Spacing tokens are named by their pixel value. The sidebar is 224px wide with no padding of its own: its sections pad themselves, and every padding and gap in it is `space-8`, so rules between sections, like the one above the account, run edge to edge. Its tools row is `size-control-md` tall (the collapse toggle at the start, search and invite at the end, 36px icon buttons 8px apart), the Home / Organization switch under it is a full-width segmented control, its section labels run a rule to the edge, its nav rows are `size-control-md` tall (children `size-control-sm`), and the account button at the bottom is a `size-control-md` row too. Collapsed it is a 53px rail of icons, with the toggle at the same spot and the tools stacked under it. The top bar across the inset is 48px on a `line-soft` rule and pads the inset's padding less 8px, so its first crumb's text lines up with the page title. The inset pads `space-40` (bottom `space-48`), page sections are `space-44` apart, side by side sections `space-32`. Inside components:

- 3px between a shell and its inset surface, inside segmented tracks, and inside menus and listboxes.
- 6px label to control.
- 8px icon to label, and between buttons inside a row or item.
- 10px inside text fields, input groups and select, combobox and multiselect triggers, left and right.
- **Rows in menus and listboxes line up with the trigger**: the list pads 3px and each row 7px, so a row's text starts 11px from the list's outer edge, exactly where a trigger's text starts (10px plus its border), and its hover ground sits 4px from the edge, like a nested item in a field. Group labels and the MultiSelect count bar follow the same line; checks, meta, shortcuts and the bar's Select all and Deselect all labels end 11px from the edge, under the trigger's chevron. Separators run edge to edge with 3px above and below them, the same space a row keeps from the sides; the MultiSelect bar's rule keeps the same 3px to the first option.
- 12px between buttons in footers, around popover content in both directions, and around dialog and sheet footers.
- **Nested items**: icon buttons, shortcut hints and clear buttons inside a field sit in one group at its end, each in a square slot of `size-nested-md` (28px in a 36px field; `size-nested-sm` 24px in a small one, `size-nested-lg` 32px in a large one). A slot is 4px from the field's outer edge on every side, so the field's end padding drops to 3px beside the group. Slots in a group are 4px apart; the group and the field's text stay 8px apart. Buttons fill their slot; an 18px item (a Kbd, a small Badge) centers in it with equal space on every side.
- 14px row padding.
- 16px card, alert and alert dialog padding.
- 20px dialog and sheet body padding.

Heights are tokens too, so controls and badges line up in any row: `size-control-sm` 32px, `size-control-md` 36px (the default for buttons, inputs, and select, combobox and popover triggers), `size-control-lg` 40px; `size-badge-sm` 18px, `size-count` 20px, `size-badge` 22px; nested items inside a field take `size-nested-sm` 24px, `size-nested-md` 28px or `size-nested-lg` 32px, the field height minus 8px. Icon-only buttons are square at their control height. Table rows are 48px and data grid rows 32px; compact list rows and tabs 40px; vertical tabs 36px, like nav rows; tree rows 32px, 28px in popovers, indenting 16px a level. Code blocks pad 12px by 14px under a 40px header. Table and data grid columns fit their widest cell and never go under `size-cell-min` (64px); a column with `maxWidth` truncates past it with an ellipsis, and wider than its container a table scrolls sideways. Cards and items follow the same idea without scrolling: the main text of an item row or a plain card heading keeps `size-text-min` (160px), and the buttons or badge beside it keep their width and drop under the text when both do not fit; tile grids (`ifs-tiles`) drop a column before a tile goes under `size-tile-min` (208px). Anything truncated shows its full text on hover.

### States

States are shown with outlines, borders and color. Never a shadow, and never an edge bar on a row.

- **Hover takes the foreground's tint**: an action's hover ground is its own text color at `opacity-hover` (6% light, 12% dark), mixed over whatever it sits on (`color-mix(in srgb, currentColor var(--hover), transparent)`). A neutral action hovers neutral, a danger item hovers `bad`, an accent-fg toast action hovers accent, an info alert's dismiss hovers info. Never `select`, which is for selection, and never a color the text doesn't have. This covers menu and listbox options, ghost, secondary and icon buttons, tiles, tree rows, link and button list rows, pagination and dismiss buttons. Rows that are not actions (tables) take `row-done`; primary buttons lighten to `text2`; tiles keep their `control` border.
- **Pressed**: the same foreground at `opacity-press` (10% light, 18% dark). Filled buttons (primary, accent, destructive) hold their hover fill.
- **Focus**: text fields (inputs, input groups, select and combobox triggers) turn their border `ink` and add a 3px outline of `ink` at `opacity-nudge` (20%, tuned per theme); an open select looks the same. The outline is a soft halo; the ink border carries the contrast. Everything else (buttons, checkboxes, switches, tabs, links, tiles, cards) gets a 2px solid `ink` outline, 2px outside its edge. Rows and views inside a scroller (tree rows, code views) draw the same outline 2px inside their edge, so it is never clipped.
- **Error and active**: a border variant. An invalid field rests like any field: a `bad-control` border (the `control` step in `bad`) and no outline, with its error text under it. Focused or open, it takes a `bad` border and a 3px `bad` nudge outline. Open or active fields take an `ink` border.
- **Selected, standalone**: cards, tiles and whole-row options take a 1px `ink` border, plus the 2px focus outline when focused or current.
- **Selected, connected rows**: tables, lists and menus change color instead. A list's current row (the one open) and its checked rows both take `select`. The row takes `select` and its text steps up one level (`text2` to `ink`, `muted` to `text2`). No bars or edge marks. `select` is neutral in both themes (#EEEDE6 light, #262626 dark); the accent never tints a selection.
- **Disabled**: `faint` text on `line-soft` or `tint`, `not-allowed` cursor. Prefer an enabled control that explains what is missing.
- **Resolved**: items stay in place on `row-done` with `muted` titles, so lists never jump.

### Motion

Motion reports work, or follows a choice. The inline spinner's two pixels trade size (6, 4 and 2px) once every 1.2s; the base and page spinners' lit run loops the mark every 1.6s or 2.4s, fading in four steps; a busy button's halftone band sweeps left to right one 3px cell per step, 84px every 1.2s, inverting what it crosses on filled buttons and masking the content of ghost ones; skeletons pulse over 1.4s; indeterminate progress slides over 1.5s. Motion that follows a choice shares one curve, 200ms `cubic-bezier(.2, 0, 0, 1)` (`--ifs-slide`): a tablist's underline bar or segmented thumb slides and resizes to the picked tab, jumps included, and never animates in; a region opened with AnimatedCollapse grows to its height and fades in, its chevron turning over the same 200ms (tree folders, JSON nodes, disclosures). A tablist that overflows scrolls the picked tab clear of its 32px edge fade, and vertical scrollers (code, JSON, trees, long listboxes) fade the edge with more content over the same 32px. A table viewport follows a choice too: when load more grows it, it eases to its new height over the same 200ms. So do the composites: a multistep step or an announcement card slides 24px in from the direction of travel while the one it replaces slides out, and its box eases to the new height; a multistep dialog grows out of its trigger and shrinks back into it; the sidebar eases between 224px and its rail; the floating action bar rises 12px as it fades in. Nothing bounces, and only one thing enters with a flourish: the page spinner, whose pixels assemble into the mark once, over about 1s, before the run starts. Under `prefers-reduced-motion`, all of them stop: the inline spinner holds both pixels at 4px, the base and page spinners hold still as the full mark, a busy button keeps a still field of 1px dots, tab indicators, table viewports, steps, cards, the sidebar and the floating action bar jump, a multistep dialog appears without growing from its trigger, and collapsing regions open and close at once.

### Imagery

No photos, illustrations or gradients in product UI. Identity is carried by initials on ink, the machine and agent glyphs, the mark, and type. What's new cards show the feature itself: real components, made inert, on `tint` under a faint dot grid.

## Iconography

Infisical's own line icons: a 24px grid, 1.7 stroke, round caps and joins, drawn in `currentColor` so they take the text color. 16px inside controls, 18px in navigation and list media, 14px in small buttons; checks inside checkboxes use a 2.6 stroke. The set has 51 icons (`Infisical.iconNames`), rendered by the `Icon` component and shipped as path data in `assets/Icons/icons.json`.

- Icons support a label and rarely replace one. Icon-only buttons need an `aria-label` and a Tooltip.
- **An icon takes its label's color.** A menu item's icon is `ink` like its label, a danger item's is `bad`, a disabled item's is `faint`. Only secondary glyphs step down to `muted`: chevrons, submenu arrows, the icons inside fields, and meta.
- Status icons are fixed: `check-c` success, `alert` warning, `alert-c` error, `info` information.
- Identity glyphs are fixed: `machine` for machine identities, `agent` for AI agents, `user` for an unknown person.
- `sidebar` collapses and expands the sidebar; `user-plus` invites people; `megaphone` opens what's new; `apps` and `building` are the Home and Organization spaces in the rail.
- Themes are `sun` (light), `moon` (dark) and `monitor` (follow the system).
- Files are `file` and folders `folder` (`folder-open` while open in a tree); secret files such as `.env` take `key`; `download` saves a file.
- No emoji, anywhere.

## Logo

The mark is the infinity loop; the wordmark sets it beside "Infisical". Both are single-ink SVGs in `assets/Logos`.

- On light grounds use `infisical-mark.svg` and `infisical-wordmark.svg` (ink #0E1014).
- On `frame` and other dark grounds use `infisical-mark-accent.svg` (the accent) and `infisical-wordmark-light.svg` (#F1F0EA).
- The app tile is the ink mark at 20 by 10 centered on a 28px `accent` square, with `radius-control` corners when corners are on. It is the only place the accent and the mark meet.
- The Spinner draws the mark on a pixel grid in `mark` (ink in light, accent in dark); its inline size abstracts it to two pixels in the text color. Buttons never carry the mark; a busy button shows the same pixel grid as a halftone band instead.
- Never recolor the mark outside these inks, outline it, or set it on a status color.

## Using the system

1. Load `tokens.css`, then `components/bundle.css` (it pulls Archivo's width axis from Google Fonts; the files in `fonts/` cover everything else).
2. Load React 18 and ReactDOM 18, then `components/bundle.js`. Components are on `window.Infisical`: `const { Button, Field, Input, Table } = window.Infisical`. Types are in `components/index.d.ts`.
3. Set `data-theme="light"` or `data-theme="dark"` on `<html>`; light is the default.
4. For soft corners set `--corners: 1` on `<html>` or any container.
5. Class names are prefixed `ifs-`. Layout helpers: `ifs-row`, `ifs-stack`, `ifs-tiles`, `ifs-mono`, `ifs-eyebrow`, `ifs-link`, `ifs-sr` (visually hidden). `bundle.css` sets the `body` font, size, color and background.
