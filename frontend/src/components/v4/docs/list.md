# List

Object rows with independent current state, selection and actions.

## Choose this component

Choose List for a stable collection of comparable resource rows. Use Item for an isolated rich object and DataTable when columns need comparison. For a DataList, choose compact when a card holds more than about five facts that a reader scans for one value, and default when it holds a few facts that each deserve a full row.

## Usage rules

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

Exports: List, ListRow, ListSection, DataList. Source TypeScript defines the API.

## Behavior

- Interactive rows use a translucent ink overlay on hover and press (opacity-hover and opacity-press tokens), so tinted surfaces behind the list show through.
- Framed (default: the shared tint frame with an uppercase eyebrow title and caption action, rows on an inset raised surface), plain (a bordered surface) or bare; md/sm, static/link/button rows and actions below.
- Link and button rows tint with ink on hover (6% light, 12% dark) and a step further while pressed; current and selected rows keep their select ground.
- Section heads are 32px uppercase eyebrow labels with an optional tabular meta count.
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
- Large columnar datasets belong in DataTable; cell editing belongs in DataGrid.
- Compact density is for props and meta DataLists. A stat value keeps the display role and grows its row past 32px.
- A compact full-width row gives the value less room than default density, so a UUID in a size-sidecar card wraps onto a second line.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- framed: example `default`, visible label "framed".
- plain: example `variants`, visible label "plain".
- bare: omitted. bare drops the border and the row rules and keeps the inset; the list fixture test renders it.

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

Registry items used: @infisical/button, @infisical/empty, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
import { DataList, List, ListRow } from "../../../../components/v4/ui/list";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Connections" title="Connections">
          <ListRow value="staging" label="Staging service" title="Staging service" description="Read access to project versions" meta="12 versions"/>
          <ListRow value="production" label="Production service" title="Production service" description="Write access, approval required" actions={<Button variant="outline">Review</Button>}/>
          <ListRow value="preview" label="Preview service" title="Preview service" meta="2 versions"/>
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Empty connections" empty={<EmptyState size="sm" media="bare" title="No connections yet"/>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataList variant="stat" items={[
            ["Connections", 12],
            ["Policies", 0]
        ]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"stat"}</figcaption></figure>
    </div>);
}
```

### Link and button rows

Save this example at `src/pages/design-system/examples/list/interactive.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard, disabled.

Registry items used: @infisical/list. Additional packages: none. Install every listed item before compiling this example.

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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Environments" title="Environments">
          {environments.map((row) => (<ListRow key={row.id} value={row.id} label={row.title} title={row.title} description={row.description} href={`#list-${row.id}`} current={current === row.id} onClick={(event) => {
                event.preventDefault();
                setCurrent(row.id);
            }}/>))}
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"Link rows, hover a row, staging is current"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Recent requests" title="Recent requests">
          <ListRow value="rotate" label="Rotate database credentials" title="Rotate database credentials" meta="2m" onClick={() => setOpened("Rotate database credentials")}/>
          <ListRow value="access" label="Grant staging access" title="Grant staging access" meta="1h" onClick={() => setOpened("Grant staging access")}/>
          <ListRow value="expired" label="Expired request" title="Expired request" meta="3d" disabled onClick={() => setOpened("Expired request")}/>
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{`Button rows, hover or press a row. Opened: ${opened}`}</figcaption></figure>
    </div>);
}
```

### Framed, sections, plain and sm

Save this example at `src/pages/design-system/examples/list/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { List, ListRow, ListSection } from "../../../../components/v4/ui/list";
const rows = (prefix: string) => (<>
    <ListRow value={`${prefix}-api`} label="API service" title="API service" description="Reads production secrets" meta="12 secrets"/>
    <ListRow value={`${prefix}-worker`} label="Queue worker" title="Queue worker" description="Reads staging secrets" meta="4 secrets"/>
  </>);
export default function Variants() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Machine identities" title="Machine identities" action={<a href="#list">View all</a>}>
          {rows("framed")}
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"md"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Grouped identities">
          <ListSection label="Production" meta="2">
            {rows("production")}
          </ListSection>
          <ListSection label="Staging" meta="1">
            <ListRow value="staging-preview" label="Preview deploys" title="Preview deploys" description="Reads staging secrets" meta="3 secrets"/>
          </ListSection>
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"framed, sections"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Plain identities" variant="plain">
          {rows("plain")}
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"plain"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <List label="Small identities" size="sm" title="Identities">
          {rows("sm")}
        </List>
      </div><figcaption className="text-muted-foreground text-xs">{"sm"}</figcaption></figure>
    </div>);
}
```

### DataList default and compact density

Save this example at `src/pages/design-system/examples/list/density.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/badge, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataList variant="props" items={items}/>
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataList variant="props" density="compact" items={items}/>
      </div><figcaption className="text-muted-foreground text-xs">{"compact, half pairs and a lone half"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/list-activity-lifecycle.test.tsx
- runtime: npm test -- src/components/v4/ui/data-list-density.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
