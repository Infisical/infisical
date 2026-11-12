# List

Object rows with independent current state, selection and actions.

## Choose this component

Choose List for a stable collection of comparable resource rows. Use Item for an isolated rich object and DataTable when columns need comparison. For a DataList, choose compact for every detail page's facts card, whatever its length, and default for short summaries, stat lists and anything in a sheet or dialog.

## Usage rules

### list-detail-facts-compact

Owner: list.

When a detail page shows one record's facts in its details card or DetailLayout sidecar.

Do: Render the DataList with density="compact" and pair short values with span half.

Avoid: Leave the facts card at default density on some detail pages, or use compact inside a Sheet or Dialog.

Why: Every record page then reads its facts at one row height, and sheets keep the roomier rows their narrower width needs.

Checked by: review only. Look for: Open each detail page and check its facts card is compact, while DataLists in sheets keep the default.

Source evidence:
- src/components/v4/ui/list.tsx
- src/pages/design-system/examples/list/density.tsx

### list-variant-owner

Owner: list.

When a composite needs a list treatment: cards, rules, a header row or a footer.

Do: Pass the variant through to List and compose ListHeader, ListSection, ListRow and ListFooter. Add only what the composite owns, such as media tiles, row actions and its copy.

Avoid: Restyle List's grounds, gaps, rules, hover, press or resolved fills from a composite's own CSS.

Why: One source per treatment keeps List and every composite on it identical, and a fix in List reaches all of them.

Checked by: review only. Look for: A composite built on List ships no CSS that targets list rows, sections, the list header or footer.

Source evidence:
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/list/segmented-divided.tsx

### list-usage

Owner: list.

When a focused row disappears after removal or filtering.

Do: Supply stable row ids and keep focus on the nearest remaining row target, or the named empty list when no rows remain.

Avoid: Use indexes as ids or move focus away from an external control that the person has already chosen.

Why: Focus recovery belongs to the removed list target and must not steal unrelated focus.

Checked by: review only. Look for: Remove a focused row and update a selected collection. Focus recovers only from the removed target, unique row identities remain stable and unrelated external focus is preserved.

Source evidence:
- src/components/v4/ui/list.tsx
- src/pages/design-system/examples/list/default.tsx

### list-row-and-selection

Owner: list.

When a comparable collection has current details, bulk selection and independent actions.

Do: Use stable row values and explicit title, meta, badge and actions slots; preserve the distinction between current and selected ids.

Avoid: Use row index as identity, concatenate a title with its count or let a trailing action activate the row as well.

Why: Opening details and choosing records for bulk work are separate operations that need stable identity.

Checked by: review only. Look for: Select, open, remove and reorder rows with long titles. Selection follows ids, actions do not open details accidentally and title/metadata lanes remain readable.

Source evidence:
- src/components/v4/ui/list.tsx
- src/pages/design-system/examples/list/default.tsx

### list-data-density

Owner: list.

When a detail card or sidecar lists many facts about one record.

Do: Use DataList density compact and mark short single-line values with span half so they pair, keeping long values such as IDs and metadata on full rows.

Avoid: Pair a value that wraps or holds a list, or use compact for a two-fact summary, so pairs stop lining up and the card gains nothing.

Why: Compact rows fit more of the record above the fold, but only when paired values stay on one line.

Checked by: review only. Look for: Render the detail card at size-sidecar width in both densities. Compact rows measure 32px, every half pair shares one row with both values on one line, and terms wrap only between words.

Source evidence:
- src/components/v4/ui/list.tsx
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/list/density.tsx

## State guidance

- compact: Pair only short single-line values with span half: roles, dates, On or Off, a status badge. Keep IDs, links, lists and metadata as full rows.
- empty: Explain the empty result and retain a named focus fallback.
- selection: Keep selection eligibility distinct from the row's primary open action.

## Presentation rules

Do: Use title, metadata and optional actions consistently across rows.

Avoid: Populate every optional row slot or repeat the same information below and beside the title.

Why: Consistent meaningful geometry helps compare resources without unnecessary density.

## Import and exports

- src/components/v4/ui/list.tsx
- src/components/v4/ui/data.module.css

Exports: List, ListRow, ListSection, ListHeader, ListFooter, DataList. Source TypeScript defines the API.

## Behavior

- Interactive rows use a translucent ink overlay on hover and press (the shared hover and press tokens), so tinted surfaces behind the list show through.
- Framed (default: the shared tint frame with an uppercase eyebrow title and caption action, rows on an inset raised surface), plain (a bordered surface), bare, segmented (no container, each row a borderless tint card with a gap between) or divided (no container, rows split by line-soft rules); md/sm, static/link/button rows and actions below.
- Link and button rows tint with ink on hover (6% light, 12% dark) and a step further while pressed; current and selected rows keep their select ground.
- A list embedded in a framed card is frameless. Inside a framed Card, a DataTable or another framed List, a List that would be framed (the default, or ApprovalQueue's default) drops its tint frame and inset and sits on the parent's surface, with its header in the plain list header style.
- A row links with href for a plain URL or link for a router destination (the app's link target; TanStack LinkOptions in the app). link renders one real anchor through CipherLink, so the href is typed and real, a plain click navigates in the app and modifier or middle clicks open a new tab natively, with no buildLocation or navigate at the call site.
- ListHeader (title, count, action) and ListFooter can sit among List's children in place of the title, count, action and footer props. framed puts the header in its eyebrow band with count and action on the right; every other variant gives it its own row with a title-sm title, a muted count and the action slot.
- Resolved rows stay in place on a quieter fill: row-done inside framed and plain surfaces, row-done-card (half the tint) for segmented cards, and row-done-divided (translucent ink, quieter than hover) for divided rows on the page.
- segmented and divided align the header, section heads and footer with the row content at surface-inset-sm. Every ground, gap, rule, hover, press and resolved fill of a variant lives here, so composites built on List (ApprovalQueue, ActivityLog, AccessList) inherit it.
- Section heads are 32px uppercase eyebrow labels with an optional tabular meta count.
- framed is the default and the right choice for most standalone lists. Pick another variant case by case: plain or bare inside a surface that already has an edge, segmented or divided for a feed or queue that is the page's main content.
- The title line never wraps: the title shrinks and ends in an ellipsis, and the meta keeps its width at the top right of the title's first line.
- Selection skips disabled and locked rows. Current details and bulk selection remain independent.
- Loading appends placeholders below retained rows; sections, empty and footer compose.
- DataList terms wrap only between words and never break inside one; a term keeps at least its longest word even past its 45% share, and values wrap instead.
- DataList density compact draws 32px rows (size-data-list-row) with no gap between them: the term sits in a size-data-list-term column and the value starts beside it instead of aligning right. Its terms keep the same word-only wrapping, and a single word longer than the column widens it.
- In compact density an item marked { span: "half" } pairs with the next half item, two to a row, each with its term stacked over its value. Pairing runs in order, so a half item with no half neighbor takes the full row. Default density ignores span.

## Accessibility

- Semantic lists with named selection controls; no nested interactive row targets.
- Arrow/Home/End movement across row targets; Tab reaches independent actions.
- Removing a focused row moves focus to its nearest remaining main target, or the named list fallback when empty. External focused controls keep focus.
- Unread and selected counts have textual announcements.

## Use cases

- Use framed, plain or bare List with sm or md rows, and keep current details independent from optional multiple selection.
- Use DataList density compact for the facts of one record on a detail page (the details card, a DetailLayout sidecar, subject and key usage cards), and keep default density for short summaries, stat lists and sheets.

## Limits

- Supply unique string row ids and accessible labels.
- ListRow and ListSection must be direct descendants or wrappers that forward children for selection discovery.
- ListHeader and ListFooter must be direct children of List, not inside a fragment; List finds them by element type.
- Large columnar datasets belong in DataTable; cell editing belongs in DataGrid.
- Compact density is for props and meta DataLists. A stat value keeps the display role and grows its row past 32px.
- A compact full-width row gives the value less room than default density, so a UUID in a size-sidecar card wraps onto a second line.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- framed: example `default`, visible label "framed".
- plain: example `variants`, visible label "plain".
- bare: example `variants`, visible label "bare".
- segmented: example `segmented-divided`, visible label "segmented".
- divided: example `segmented-divided`, visible label "divided".

### size

- md: example `variants`, visible label "md".
- sm: example `variants`, visible label "sm".

### DataList.variant

- stat: example `default`, visible label "stat".
- meta: omitted. meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it.
- props: omitted. meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it.

### DataList.density

- default: example `density`, visible label "default".
- compact: example `density`, visible label "compact, half pairs and a lone half".

### state and behavior

- no selection: example `default`, visible label "framed".
- empty: example `default`, visible label "Empty".
- disabled: example `interactive`, visible label "Button rows, hover or press a row. Opened: None".
- current row: example `interactive`, visible label "Link rows, hover a row, staging is current".
- multiple: omitted. Multiple selection adds a checkbox to each row and the header; the list fixture test renders it.
- below actions: omitted. Actions below move the row actions under the description; the list fixture test renders it.
- protected: omitted. A protected row keeps a disabled checkbox; the list fixture test renders it.
- loading: omitted. Loading appends skeleton rows under retained rows; the list fixture test renders it.

## Executable examples

### Rows and empty list

Save this example at `src/pages/design-system/examples/list/default.tsx`; its relative imports are generated for that exact path. States: default, empty.

Registry items used: @cipher/button, @cipher/empty, @cipher/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
import { DataList, List, ListRow } from "../../../../components/v4/ui/list";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Connections" title="Connections">
            <ListRow
              value="staging"
              label="Staging service"
              title="Staging service"
              description="Read access to project versions"
              meta="12 versions"
            />
            <ListRow
              value="production"
              label="Production service"
              title="Production service"
              description="Write access, approval required"
              actions={<Button variant="outline">Review</Button>}
            />
            <ListRow
              value="preview"
              label="Preview service"
              title="Preview service"
              meta="2 versions"
            />
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List
            label="Empty connections"
            empty={<EmptyState size="sm" media="bare" title="No connections yet" />}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataList
            variant="stat"
            items={[
              ["Connections", 12],
              ["Policies", 0]
            ]}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"stat"}</figcaption>
      </figure>
    </div>
  );
}
```

### Link and button rows

Save this example at `src/pages/design-system/examples/list/interactive.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard, disabled.

Registry items used: @cipher/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { List, ListRow } from "../../../../components/v4/ui/list";

const environments = [
  { id: "development", title: "Development", description: "14 secrets, synced 2 minutes ago" },
  { id: "staging", title: "Staging", description: "12 secrets, synced 1 hour ago" },
  { id: "production", title: "Production", description: "12 secrets, approval required" }
];
export default function Interactive() {
  const [current, setCurrent] = React.useState("staging");
  const [opened, setOpened] = React.useState("None");
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Environments" title="Environments">
            {environments.map((row) => (
              <ListRow
                key={row.id}
                value={row.id}
                label={row.title}
                title={row.title}
                description={row.description}
                href={`#list-${row.id}`}
                current={current === row.id}
                onClick={(event) => {
                  event.preventDefault();
                  setCurrent(row.id);
                }}
              />
            ))}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Link rows, hover a row, staging is current"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Related components" title="Related components">
            {(
              [
                ["table", "Table", "Typed rows with selection and row actions"],
                ["card", "Card", "Plain by default, framed for emphasis"]
              ] as const
            ).map(([component, title, description]) => (
              <ListRow
                key={component}
                value={component}
                label={title}
                title={title}
                description={description}
                link={{ href: `/design-system/components/data-display/${component}` }}
              />
            ))}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Router link rows, a modifier click opens a new tab"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Recent requests" title="Recent requests">
            <ListRow
              value="rotate"
              label="Rotate database credentials"
              title="Rotate database credentials"
              meta="2m"
              onClick={() => setOpened("Rotate database credentials")}
            />
            <ListRow
              value="access"
              label="Grant staging access"
              title="Grant staging access"
              meta="1h"
              onClick={() => setOpened("Grant staging access")}
            />
            <ListRow
              value="expired"
              label="Expired request"
              title="Expired request"
              meta="3d"
              disabled
              onClick={() => setOpened("Expired request")}
            />
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{`Button rows, hover or press a row. Opened: ${opened}`}</figcaption>
      </figure>
    </div>
  );
}
```

### Framed, sections, plain and sm

Save this example at `src/pages/design-system/examples/list/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { List, ListRow, ListSection } from "../../../../components/v4/ui/list";

const rows = (prefix: string) => (
  <>
    <ListRow
      value={`${prefix}-api`}
      label="API service"
      title="API service"
      description="Reads production secrets"
      meta="12 secrets"
    />
    <ListRow
      value={`${prefix}-worker`}
      label="Queue worker"
      title="Queue worker"
      description="Reads staging secrets"
      meta="4 secrets"
    />
  </>
);
export default function Variants() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List
            label="Machine identities"
            title="Machine identities"
            action={<a href="#list">View all</a>}
          >
            {rows("framed")}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"md"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Grouped identities">
            <ListSection label="Production" meta="2">
              {rows("production")}
            </ListSection>
            <ListSection label="Staging" meta="1">
              <ListRow
                value="staging-preview"
                label="Preview deploys"
                title="Preview deploys"
                description="Reads staging secrets"
                meta="3 secrets"
              />
            </ListSection>
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"framed, sections"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Plain identities" variant="plain">
            {rows("plain")}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"plain"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Bare identities" variant="bare">
            {rows("bare")}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"bare"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="Small identities" size="sm" title="Identities">
            {rows("sm")}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"sm"}</figcaption>
      </figure>
    </div>
  );
}
```

### Segmented and divided, with header, sections and footer

Save this example at `src/pages/design-system/examples/list/segmented-divided.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/item, @cipher/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Media } from "../../../../components/v4/ui/item";
import { List, ListFooter, ListHeader, ListRow, ListSection } from "../../../../components/v4/ui/list";

const header = (
  <ListHeader
    title="What's new"
    count="2 unread"
    action={
      <Button variant="link" size="sm" asChild>
        <a href="#list">View all</a>
      </Button>
    }
  />
);

const sections = (variant: string) => [
  <ListSection key="week" label="This week">
    <ListRow
      value={`${variant}-gateway-pools`}
      label="Gateway pools"
      title="Gateway pools"
      description="Route PAM sessions through any healthy gateway in a pool."
      media={<Media icon="globe" />}
      meta="Nov 5"
      href="#list"
      unread
    />
    <ListRow
      value={`${variant}-rotation`}
      label="Scheduled rotation for Postgres"
      title="Scheduled rotation for Postgres"
      description="Rotate database credentials on a schedule you set per environment."
      media={<Media icon="key" />}
      meta="Nov 4"
      href="#list"
      unread
    />
  </ListSection>,
  <ListSection key="earlier" label="Earlier">
    <ListRow
      value={`${variant}-audit-streams`}
      label="Audit log streams to Datadog"
      title="Audit log streams to Datadog"
      description="Send every audit event to Datadog as it happens."
      media={<Media icon="sync" />}
      meta="Oct 28"
      href="#list"
    />
    <ListRow
      value={`${variant}-sso`}
      label="SSO enforcement for sub-organizations"
      title="SSO enforcement for sub-organizations"
      description="Require SSO in every sub-organization from the parent's settings."
      media={<Media icon="lock" />}
      meta="Oct 21"
      href="#list"
      resolved
    />
  </ListSection>
];

const footer = (
  <ListFooter>
    <Button variant="link" size="sm" asChild>
      <a href="#list">Release notes</a>
    </Button>
  </ListFooter>
);

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="What's new" variant="segmented">
            {header}
            {sections("segmented")}
            {footer}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"segmented"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <List label="What's new" variant="divided">
            {header}
            {sections("divided")}
            {footer}
          </List>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"divided"}</figcaption>
      </figure>
    </div>
  );
}
```

### DataList default and compact density

Save this example at `src/pages/design-system/examples/list/density.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/badge, @cipher/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { type DataListItem, DataList } from "../../../../components/v4/ui/list";

const items: DataListItem[] = [
  ["ID", <code key="id">4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11</code>],
  ["Managed by", "Organization", { span: "half" }],
  ["Organization role", "Member", { span: "half" }],
  [
    "Status",
    <Badge key="status" tone="ok" dot>
      Active
    </Badge>,
    { span: "half" }
  ],
  ["Delete protection", "On", { span: "half" }],
  ["Extended key usage", "Server authentication, client authentication"],
  ["Country", "CA", { span: "half" }],
  ["Last login", "Never"]
];

export default function Density() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataList variant="props" items={items} />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataList variant="props" density="compact" items={items} />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"compact, half pairs and a lone half"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/list-activity-lifecycle.test.tsx
- runtime: npm test -- src/components/v4/ui/data-list-density.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
