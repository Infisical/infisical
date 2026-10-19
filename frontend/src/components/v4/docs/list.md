# List

Object rows with independent current state, selection and actions.

## Choose this component

Choose List for a stable collection of comparable resource rows. Use Item for an isolated rich object and DataTable when columns need comparison.

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

## State guidance

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

- Framed (default: the shared tint frame with an uppercase eyebrow title and caption action, rows on an inset raised surface), plain (a bordered surface) or bare; md/sm, static/link/button rows and actions below.
- Link and button rows tint with ink on hover (6% light, 12% dark) and a step further while pressed; current and selected rows keep their select ground.
- Section heads are 32px uppercase eyebrow labels with an optional tabular meta count.
- Selection skips disabled and locked rows. Current details and bulk selection remain independent.
- Loading appends placeholders below retained rows; sections, empty and footer compose.

## Accessibility

- Semantic lists with named selection controls; no nested interactive row targets.
- Arrow/Home/End movement across row targets; Tab reaches independent actions.
- Removing a focused row moves focus to its nearest remaining main target, or the named list fallback when empty. External focused controls keep focus.
- Unread and selected counts have textual announcements.

## Use cases

- Use framed, plain or bare List with sm or md rows, and keep current details independent from optional multiple selection.

## Limits

- Supply unique string row ids and accessible labels.
- ListRow and ListSection must be direct descendants or wrappers that forward children for selection discovery.
- Large columnar datasets belong in DataTable; cell editing belongs in DataGrid.

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

Registry items used: @infisical/button, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
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
        <List label="Empty connections" empty="No connections yet"/>
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

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/list-activity-lifecycle.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
