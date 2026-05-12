# Infisical Design System (v3)

This document captures the v3 visual language and product voice used across
Infisical. It is the single reference for engineers, designers, and AI coding
agents producing new UI or user-visible copy.

**Source of truth for tokens:** [`frontend/src/index.css`](frontend/src/index.css) (`@theme` block).
**Canonical semantic reference:** [`Badge.stories.tsx`](frontend/src/components/v3/generic/Badge/Badge.stories.tsx).
**Canonical page references:** [`OverviewPage`](frontend/src/pages/secret-manager/OverviewPage) and [`AccessControlPage`](frontend/src/pages/project/AccessControlPage).
**Component usage reference:** Every v3 generic component has a sibling `<Name>.stories.tsx` at `frontend/src/components/v3/generic/<Name>/`. Read it before producing UI with that component — the stories carry the variants, compositions, and use-when guidance the source does not.

---

## 1. Visual Theme & Atmosphere

Infisical is a security tool for operators. The interface reads like
infrastructure: dense, calm, and legible — never ornamental. Dark is the native
medium; the page canvas is `--color-background`, and light themes are not part
of the system yet.

Color carries **meaning before brand**. A danger badge is red because the
action is destructive, not because red is the accent. A project-colored button
signals project scope, not visual variety. Designers pick intent; hex values
follow.

Depth is drawn with borders and surface tones, not shadows. Motion is
restrained — 200ms ease-in-out, no springs, no decorative animation. Secret
values are masked by default; revealing one is an intentional act.

**Key characteristics:**

- Dark-native; `--color-background` page canvas
- Semantic-first color (danger / success / warning / info / neutral)
- Scope-aware (org / sub-org / project / admin)
- Border-defined depth, no decorative shadows
- Inter, one family, across everything
- Secrets masked by default; reveal is an act

## 2. Color Palette & Roles

All colors are defined as CSS custom properties in
[`frontend/src/index.css`](frontend/src/index.css) and consumed via Tailwind v4
utilities (`bg-org`, `text-danger`, etc.). Never introduce a hex that is not
in this file.

### Scope colors (hierarchy)

Used to signal the scope a surface, badge, or action belongs to.

| Scope            | Token              |
| ---------------- | ------------------ |
| Organization     | `--color-org`      |
| Sub-Organization | `--color-sub-org`  |
| Project          | `--color-project`  |
| Admin            | `--color-admin`    |

### Semantic colors

| Intent   | Token              | Use                                              |
| -------- | ------------------ | ------------------------------------------------ |
| Success  | `--color-success`  | Healthy states, completed rotations              |
| Info     | `--color-info`     | Informational states, external documentation     |
| Warning  | `--color-warning`  | Attention-warranting states, stale items         |
| Danger   | `--color-danger`   | Destructive actions, errors, expired access      |
| Neutral  | `--color-neutral`  | Disabled, muted, "empty" states                  |

### Surface & chrome

| Role               | Token                    |
| ------------------ | ------------------------ |
| Page background    | `--color-background`     |
| Foreground text    | `--color-foreground`     |
| Card surface       | `--color-card`           |
| Popover / Sheet    | `--color-popover`        |
| Container          | `--color-container`      |
| Container (hover)  | `--color-container-hover`|
| Border             | `--color-border`         |
| Focus ring         | `--color-ring`           |
| Accent text        | `--color-accent`         |
| Muted text         | `--color-muted`          |
| Label text         | `--color-label`          |

The `mineshaft-*` scale (50–900) is the underlying neutral ramp; see
`index.css` for the full list. Prefer semantic tokens (`card`, `border`,
`accent`) over raw mineshaft values.

### Product-area accents (secret-manager)

Reserved for resource types in the secret management product:
`--color-folder`, `--color-secret`, `--color-dynamic-secret`,
`--color-import`, `--color-secret-rotation`, `--color-override`.
Do not repurpose these for generic UI.

### Tint pattern

Colored variants always layer as tinted backgrounds with matching borders —
never as solid fills. The two canonical recipes:

- **Badge** — `bg-<c>/15 border-<c>/10 text-<c>`, hover `bg-<c>/35`
  (see [`Badge.tsx`](frontend/src/components/v3/generic/Badge/Badge.tsx))
- **Button** — `bg-<c>/10 border-<c>/25 text-foreground`, hover `bg-<c>/15 border-<c>/30`
  (see [`Button.tsx`](frontend/src/components/v3/generic/Button/Button.tsx))

## 3. Typography

Inter is the only font family (`--font-inter`). All weights and sizes use
Tailwind's default scale.

| Role                     | Class                                   | Notes                                                                 |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------- |
| Page title (h1)          | `text-2xl font-medium underline underline-offset-4 decoration-<scope>/90` | In `PageHeader`; scope icon (size 26) sits inline before the title    |
| Page description         | `text-mineshaft-300`                    | Sits under the title, `mt-1.5`                                        |
| Card title               | `text-lg font-semibold leading-none`    | `flex gap-1.5` so badges can sit inline                               |
| Card description         | `text-sm text-accent`                   |                                                                       |
| Body                     | `text-sm`                               | Default for table cells, form values, dialog content                  |
| Label / meta             | `text-xs text-accent`                   | Field labels, table column captions, metadata                         |
| Badge                    | `text-xs` (auto, via `Badge`)           | Never override                                                        |
| Button                   | `text-sm` (md/sm/lg), `text-xs` (xs)    | Auto via `Button` sizing                                              |

Sentence case for descriptions, helper text, and empty states. Title Case for
page titles, card titles, dialog titles, sheet titles, button labels, badge
labels, and dropdown menu items. See §8 for voice rules on copy itself.

## 4. Component Stylings

New UI must use v3 components from [`frontend/src/components/v3/`](frontend/src/components/v3).
The v2 library is legacy; only fall back when no v3 equivalent exists.
`PageHeader` is the notable exception — still v2, still canonical for page titles.

For exact tokens, class lists, and every variant, read the component source
and its `*.stories.tsx` — this doc cites them rather than duplicating them.

### Reading the stories

Every component's `.stories.tsx` follows the same shape:

- **`Variant: X`** stories — one per prop-driven variant (e.g. `Variant: Outline`).
- **`Example: X`** stories — composition recipes (e.g. `Example: With Header`,
  `Example: Inside Card / Sheet / Dialog`).
- Each story's `parameters.docs.description.story` is the use-when guidance.

When picking a component, find the `Example:` story closest to your need and
mirror it. When picking a variant, the `Variant:` story descriptions are the
canonical "use this when..." guidance.

Run Storybook with `cd frontend && npm run storybook` (port 6006) to preview.

### Component inventory

Use these tables to find the component for a given intent. For props,
variants, sizes, and class lists, open the source or its `*.stories.tsx`
— the stories are canonical.

#### Actions
| Component | Reach for this when… |
| --- | --- |
| [`Button`](frontend/src/components/v3/generic/Button/Button.tsx) | A text-bearing button — primary or secondary action. |
| [`IconButton`](frontend/src/components/v3/generic/IconButton/IconButton.tsx) | A square icon-only button — toolbars, row actions, compact triggers. Always `aria-label`. |
| [`ButtonGroup`](frontend/src/components/v3/generic/ButtonGroup/ButtonGroup.tsx) | Visually join related controls — toolbars, segmented controls, split buttons, key-value chips. |
| [`Dropdown`](frontend/src/components/v3/generic/Dropdown/Dropdown.tsx) | An action menu — overflow `⋯`, split-button alternates, contextual lists. |

#### Forms
| Component | Reach for this when… |
| --- | --- |
| [`Field`](frontend/src/components/v3/generic/Field/Field.tsx) | Wrap every form control — label + control + description + error. **Never render a bare control in a form.** |
| [`Label`](frontend/src/components/v3/generic/Label/Label.tsx) | Standalone form label outside a `Field`. |
| [`Input`](frontend/src/components/v3/generic/Input/Input.tsx) / [`TextArea`](frontend/src/components/v3/generic/TextArea/TextArea.tsx) | Single-line / multi-line text entry. |
| [`InputGroup`](frontend/src/components/v3/generic/InputGroup/InputGroup.tsx) | Input with left/right addons — search bars, prefixed values. |
| [`Select`](frontend/src/components/v3/generic/Select/Select.tsx) / [`ReactSelect`](frontend/src/components/v3/generic/ReactSelect/index.ts) | Native-style dropdown / async or searchable dropdown. |
| [`Switch`](frontend/src/components/v3/generic/Switch/Switch.tsx) / [`Checkbox`](frontend/src/components/v3/generic/Checkbox/Checkbox.tsx) | Boolean toggle / multi-select boolean. |
| [`Calendar`](frontend/src/components/v3/generic/Calendar/Calendar.tsx) | Date / multi-date / range picker primitive. |
| [`DateRangeFilter`](frontend/src/components/v3/generic/DateRangeFilter/DateRangeFilter.tsx) | Date-range filter with presets — for filter bars. |
| [`SecretInput`](frontend/src/components/v3/generic/SecretInput/SecretInput.tsx) | Secret-value editor with mask toggle and `${var}` highlighting. |
| [`PasswordGenerator`](frontend/src/components/v3/generic/PasswordGenerator/PasswordGenerator.tsx) | Generate a password against project secret-validation rules. |

#### Containers & overlays
| Component | Reach for this when… |
| --- | --- |
| [`Card`](frontend/src/components/v3/generic/Card/Card.tsx) | Default section container — tables, filters, forms, empty states all live in a Card. |
| [`Sheet`](frontend/src/components/v3/generic/Sheet/Sheet.tsx) | Right-side panel — **use for large create/edit forms** (multiple fields, multi-step, scrollable detail). |
| [`Dialog`](frontend/src/components/v3/generic/Dialog/Dialog.tsx) | Centered modal — **use for small create/edit forms** (1–2 fields, single confirmation prompt) and short interactive prompts. |
| [`AlertDialog`](frontend/src/components/v3/generic/AlertDialog/AlertDialog.tsx) | Confirm an action (destructive included). Replaces `confirm()`. |
| [`Popover`](frontend/src/components/v3/generic/Popover/Popover.tsx) | Anchored floating panel — filters, pickers, contextual UI. |
| [`Tooltip`](frontend/src/components/v3/generic/Tooltip/Tooltip.tsx) | Small floating annotation on hover/focus. |
| [`Accordion`](frontend/src/components/v3/generic/Accordion/Accordion.tsx) | Collapsible sections. |

#### Data display
| Component | Reach for this when… |
| --- | --- |
| [`Table`](frontend/src/components/v3/generic/Table/Table.tsx) | Read-mostly list of records with sortable columns. Pair with `Empty` + `Pagination`. |
| [`DataGrid`](frontend/src/components/v3/generic/DataGrid/data-grid.tsx) | Editable spreadsheet-style grid — copy/paste, multi-cell selection, keyboard nav. Use only when `Table` isn't enough. |
| [`Pagination`](frontend/src/components/v3/generic/Pagination/Pagination.tsx) | Page controls under a Table or list. |
| [`Item`](frontend/src/components/v3/generic/Item/Item.tsx) | Vertically-stacked list rows with shared spacing — when a `Table` is too heavy. |
| [`Detail`](frontend/src/components/v3/generic/Detail/Detail.tsx) | Read-only label/value pairs in a detail view. |
| [`Badge`](frontend/src/components/v3/generic/Badge/Badge.tsx) | Small label or chip — status, scope tag, key/value pair. |

#### Navigation & search
| Component | Reach for this when… |
| --- | --- |
| [`Sidebar`](frontend/src/components/v3/generic/Sidebar/Sidebar.tsx) | Scope-aware product navigation panel. |
| [`Breadcrumb`](frontend/src/components/v3/generic/Breadcrumb/Breadcrumb.tsx) | Hierarchical location trail at the top of a page. |
| [`Command`](frontend/src/components/v3/generic/Command/Command.tsx) | Search-driven command palette / typeahead list. |

#### Feedback & loading
| Component | Reach for this when… |
| --- | --- |
| [`Alert`](frontend/src/components/v3/generic/Alert/Alert.tsx) | Inline message banner inside a page or Card. |
| [`Toast`](frontend/src/components/v3/generic/Toast/Toast.tsx) | Transient post-action feedback. Replaces `alert()`. |
| [`Empty`](frontend/src/components/v3/generic/Empty/Empty.tsx) | Zero-state placeholder — pair with Table, list, or empty filter. |
| [`Skeleton`](frontend/src/components/v3/generic/Skeleton/Skeleton.tsx) | Shimmer placeholder while data is loading. |
| [`PageLoader`](frontend/src/components/v3/generic/PageLoader/PageLoader.tsx) | Centered Lottie spinner for full-page loading. |

#### Atoms & domain
| Component | Reach for this when… |
| --- | --- |
| [`Separator`](frontend/src/components/v3/generic/Separator/Separator.tsx) | Horizontal/vertical divider. |
| [`ScopeIcons`](frontend/src/components/v3/platform/ScopeIcons.tsx) | `OrgIcon` / `SubOrgIcon` / `ProjectIcon` / `InstanceIcon` — use when intent is scope. |
| [`DocumentationLinkBadge`](frontend/src/components/v3/platform/DocumentationLinkBadge/DocumentationLinkBadge.tsx) | Inline "Documentation" link badge in `CardTitle`. |

**Icons** — [`lucide-react`](https://lucide.dev). Sizing is bound by the
host component; don't override unless necessary.

## 5. Layout Principles

- **Page container** — `max-w-8xl` (88rem) centered, `bg-bunker-800`.
- **Page header** — `PageHeader` with scope icon + underlined `h1` + description. See [`PageHeader.tsx`](frontend/src/components/v2/PageHeader/PageHeader.tsx). Always set `scope` to the correct hierarchy level.
- **Section** — one `Card` per logical section. Title + optional `DocumentationLinkBadge` in `CardHeader`; primary action in `CardAction` (top-right).
- **Tables inside Cards** — filters and search sit in the `CardHeader` above the table; pagination sits in the `CardFooter` or bottom of `CardContent`. **Empty state** — when the table has no rows (and isn't loading), hide the `Table` entirely and render `Empty` in its place; never leave a column header floating above a blank body. Add `className="border"` to `Empty` whenever it's nested in a `Card`, `Sheet`, or `Dialog` so the dashed frame is visible against the parent surface (the component ships dashed-but-borderless on purpose for page-level use).
- **Forms inside Sheets/Dialog** — create / edit flows open in a Sheet or Dialog, never inline, never as a full-page route. **Pick by form size:** small forms (1–2 fields, e.g. "Add domain", "Rename") go in a centered `Dialog`; large or multi-step forms (multiple fields, scrollable detail, file uploads, wizard steps) go in a right-side `Sheet`. When in doubt, default to Dialog — Sheet is for cases where Dialog feels cramped.
- **Spacing rhythm** — `gap-1.5` (intra-element), `gap-2 / gap-3` (adjacent elements), `p-4 / p-5` (section padding). Card = `p-5 gap-5`; Sheet header/footer = `p-4`.

## 6. Depth & Elevation

Depth is conveyed by layered surface tones and borders. Shadows are reserved
for elements that float (Popover, DropdownMenu, Sheet).

| Layer               | Surface            | Border        |
| ------------------- | ------------------ | ------------- |
| Page                | `bg-bunker-800`    | —             |
| Card                | `bg-card`          | `border-border` |
| Popover / Sheet     | `bg-popover`       | `border-border` + `shadow-lg` |
| Row hover           | `bg-container-hover` | — |
| Focus               | — | 3px ring, `--color-ring` |
| Disabled            | `opacity-50 / 75`, `pointer-events-none` | — |

Never add a box-shadow to a Card, Table row, or Badge; it breaks the
border-defined system.

## 7. Do's and Don'ts

- **DO** choose Badge and Button variants by **intent** (danger / success /
  warning / info / neutral), not by color preference.
- **DO** use scope colors (`org`, `sub-org`, `project`, `admin`) to reinforce
  hierarchy — the scope of a page, a primary button, a scope-link badge.
- **DO** mask secret values by default. Reveal must be an explicit user
  action and should be logged.
- **DO** put large create / edit forms in a right-side Sheet; smaller forms can be in Dialogs.
- **DO** pair destructive confirmations with the resource name and the
  consequence (see §9).
- **DO** cite tokens (`bg-card`) over hex (`#xxxxxx`) in new code.
- **DON'T** use v2 components when a v3 equivalent exists unless the existing scope is v2.
- **DON'T** add box-shadows as a depth cue — borders and surface tones do
  that work. The exception is elements that genuinely float (Popover,
  DropdownMenu, Sheet), which already include it.
- **DON'T** invent new colors. If it isn't in `index.css` `@theme`, it
  doesn't belong.
- **DON'T** use `project` yellow, `org` blue, or `sub-org` green as generic
  accents. They are scope signals; repurposing them creates false hierarchy.
- **DON'T** mix font families. Inter only.
- **DON'T** animate for decoration. Motion should clarify state change only.

## 8. Voice & Content Tone

Copy should read as if written by an engineer for another engineer: direct,
technical, specific. The domain is serious — secrets, access, compliance —
and the voice reflects that.

### Stance

- Direct. Active voice. Lead with the subject: "Delete this role" — not
  "This role will be deleted".
- Specific. Name the resource, the action, the consequence. Avoid vague
  verbs ("handle", "manage") when a precise verb exists (`rotate`, `revoke`,
  `import`).
- Calm. No exclamation marks. No second-person cheer ("Awesome!",
  "You're all set!"). No emoji.
- Honest. Never claim speed, power, or ease in UI copy ("seamless",
  "powerful", "blazing-fast"). Those belong on the marketing site, not here.

### Shapes

- **Labels & buttons** — Title Case, imperative: "Add Secret", "Revoke
  Access", "Rotate Key".
- **Title Case applies to** — buttons, badges, dropdown menu items, card
  titles, dialog titles, sheet titles, page titles, tab labels, table column
  headers. Anything that names a thing or an action is Title Case.
- **Descriptions & helper text** — sentence case, one short sentence.
- **Empty states** — state what's missing, then the next action:
  "No secrets yet. Add your first secret to get started."
- **Errors** — name the failure and the remedy. Never "Something went wrong":
  "Could not rotate secret — token lacks `secrets:write` permission."
- **Destructive confirmation** — name the resource and the consequence "Delete "API_KEY" — this cannot be undone."
- **Success toasts** — past tense, specific: "Secret "API_KEY" created".

### Secrets & sensitive values

Never include a secret's value in any user-visible copy — UI, logs, toasts,
errors, audit trails, or analytics. Refer to secrets by key only. Mask
tokens and keys in screenshots and docs as well.

### Documentation links

Use `DocumentationLinkBadge` (info variant, external-link icon). Label it
"Documentation" — not "Learn more", "Read docs", "See more".

## 9. Agent Prompt Guide

Pasteable prompt fragments for AI coding agents producing new UI.

**Before generating UI for any component:**

1. Open `frontend/src/components/v3/generic/<Name>/<Name>.stories.tsx`.
2. Pick the `Example:` story closest to your need; mirror its composition exactly.
3. Pick the variant by reading the matching `Variant:` story's description —
   not by color preference.

**Adding a section to an existing page:**
> Wrap the section in a `Card` from `@app/components/v3`. Use `CardHeader`
> with `CardTitle` + optional `CardDescription` + `CardAction` for the
> top-right primary button (variant `project` on a project page). Put the
> table or content in `CardContent`.

**A new create/edit form:**
> Pick the container by form size. **Small forms (1–2 fields, e.g. "Add
> domain", "Rename"):** centered `Dialog` (`Dialog`, `DialogContent`,
> `DialogHeader` with `DialogTitle` + `DialogDescription`, `DialogFooter`
> with the action buttons). **Large or multi-step forms (many fields,
> scrollable detail, wizards):** right-side `Sheet` (`Sheet`, `SheetContent`,
> `SheetHeader` with `SheetTitle` + `SheetDescription`, `SheetFooter` with
> the action buttons). Use `react-hook-form` with a Zod resolver in both
> cases. Each input is wrapped in `Field` + `FieldLabel` + `FieldContent` +
> `FieldError`. Primary button variant is scope dependent (`project` /
> `org` / `sub-org`), cancel is `ghost`.

**A status indicator:**
> Use `Badge` from `@app/components/v3`. Pick the variant by intent:
> `danger` for errors or expired access, `warning` for stale or
> attention-warranting, `success` for healthy / completed, `info` for
> informational, `neutral` for disabled / empty, `project` / `org` /
> `sub-org` for scope references. Include a matching Lucide icon as the
> first child.

**A destructive confirmation:**
> Use `AlertDialog`. Title: "Delete `<resource-name>`". Description: one
> sentence naming the consequence, ending with "This cannot be undone."
> Confirm button is variant `danger`. Cancel button is variant `outline`.

**A documentation link in a section:**
> Use `DocumentationLinkBadge` from `@app/components/v3/platform`. Place it
> in the `CardTitle` next to the section name.

**Refer to:**

- [`Badge.stories.tsx`](frontend/src/components/v3/generic/Badge/Badge.stories.tsx) — canonical semantic reference for variant choice.
- [`OverviewPage`](frontend/src/pages/secret-manager/OverviewPage) — full-page reference (PageHeader, Card-with-table, Create Secret Sheet, filters, DropdownMenu + ButtonGroup).
- [`AccessControlPage`](frontend/src/pages/project/AccessControlPage) — full-page reference (permission-gated actions, `DocumentationLinkBadge`, role badges with `ClockAlertIcon` for expired access).
- §8 above for any user-visible copy.

## Appendix: Iteration Guide

1. **Run Storybook** — `cd frontend && npm run storybook` (port 6006). Open
   Badge, Button, Card, Table, Sheet first.
2. **Read the two reference pages** — `OverviewPage` and `AccessControlPage`
   render the full v3 vocabulary in production.
3. **Tokens live in `index.css`** — `@theme` block, lines 56–214. Never
   introduce a hex that is not here.
4. **Adding a variant** — extend the `cva()` block in the component and add
   a story. Keep the tint pattern (`bg-<c>/15 border-<c>/10` for Badge,
   `bg-<c>/10 border-<c>/25` for Button).
5. **Never use v2 for new code** — unless no v3 equivalent exists.
   `PageHeader` is the notable v2 exception still used by all pages.
6. **Before merging** — `make reviewable-ui` (lint + type-check).
7. **When in doubt** — mirror `OverviewPage`.
