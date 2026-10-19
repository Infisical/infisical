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

- Framed/plain/bare, md/sm, static/link/button rows and actions below.
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
- plain: omitted. plain drops the outer border and keeps the row rules and inset; the list fixture test renders it.
- bare: omitted. bare drops the border and the row rules and keeps the inset; the list fixture test renders it.

### size


- md: omitted. Both lists use md; their captions name the variant and state.
- sm: omitted. sm hides descriptions and shortens rows to 40px; the list fixture test renders it.

### DataList.variant

- stat: example `default`, visible label "stat".
- meta: omitted. meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it.
- props: omitted. meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it.

### state and behavior

- no selection: example `default`, visible label "framed".
- empty: example `default`, visible label "Empty".
- multiple: omitted. Multiple selection adds a checkbox to each row and the header; the list fixture test renders it.
- below actions: omitted. Actions below move the row actions under the description; the list fixture test renders it.
- disabled: omitted. A disabled row mutes its text and drops its link; the list fixture test renders it.
- protected: omitted. A protected row keeps a disabled checkbox; the list fixture test renders it.
- loading: omitted. Loading appends skeleton rows under retained rows; the list fixture test renders it.
- current row: omitted. The current row takes the selected fill; the list fixture test renders it.

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

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/list-activity-lifecycle.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
