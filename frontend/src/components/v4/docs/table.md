# Table

Semantic object tables with a typed data companion for selection and large datasets.

## Choose this component

Choose DataTable for row comparison, sorting and selection. Use DataGrid when cells need spreadsheet editing, range selection or clipboard navigation.

## Usage rules

### table-usage

Owner: table.

When a table header selects rows from a paged result.

Do: Select eligible loaded rows and keep total or cross-page selection policy explicit in the host.

Avoid: Imply select-all includes unloaded records or add ARIA grid roles to a plain table without grid keyboard behavior.

Why: Selection scope and semantics must match what the user can operate.

Checked by: review only. Look for: Select-all with ineligible and unloaded rows, then sort/reload by stable id. Only eligible loaded rows change selection and the claimed scope remains accurate.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

### table-action-scope

Owner: table.

When a table exposes both per-row actions and a bulk selection action.

Do: Name the selected scope and keep each row action distinct from its selection checkbox. Make loaded-row select-all explicit when other pages exist.

Avoid: Use an ambiguous row click for selection and navigation, or claim every result is selected when only loaded ids changed.

Why: The person must know which records an action will affect before committing it.

Checked by: review only. Look for: Select a subset, navigate pages and use a row action; row identity, selected count and the operation scope agree, and one target does not activate another.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

### table-virtual-metric-and-row-identity

Owner: table.

When a row-comparison table can virtualize and select loaded records.

Do: Use stable ids and meaningful column alignment. Treat rowHeight as a minimum; every row keeps the same height while scrolling, so the list neither jumps nor leaves gaps. Use DataGrid only when spreadsheet editing is required.

Avoid: Let a row action make one row taller than the others, treat header selection as all server records or sort the displayed rows without updating the host data.

Why: Scrolling, selection and sorting must all refer to the rows the person sees.

Checked by: review only. Look for: Scroll across virtual slices with row actions present, sort and select eligible rows. The measured row height matches the model, scroll position stays stable and selection excludes protected rows.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

## State guidance

- empty: Show an explanation spanning the table's columns while retaining relevant filters.
- virtual: Keep every row one height and set explicit column widths when the table is virtualized. Larger content raises all rows above the requested rowHeight.

## Presentation rules

Do: Lead with resource rows. Align comparable values and keep row geometry stationary while hovering or selecting.

Avoid: Lift rows on hover, animate loaded totals, replace ordinary metadata with badges or add decorative columns.

Why: Stable lanes support comparison. Counts must describe actual loaded rows and meaningful exceptions belong beside their resource.

## Import and exports

- src/components/v4/ui/table.tsx
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data.module.css
- src/components/v4/ui/frame.module.css

Exports: DataTable, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption, DataTableColumn, EnvMark. Source TypeScript defines the API.

## Behavior

- DataTable composes existing Table parts without imposing ARIA grid keyboard semantics.
- DataTable sits in the shared tint frame: the column header row is a 40px uppercase eyebrow row in the frame and the body rows sit on the inset raised surface.
- Basic/striped/bordered, controlled sorting, stable selection, empty and load-more.
- Sortable headers show the direction with an icon: up for ascending, down for descending and a two-way arrow when the column is not sorted. The sorted header steps up to ink.
- Content sizing floors, capped values, pinned action column and optional fixed-height row virtualization.

## Accessibility

- Native table/header/cell semantics, labelled selection and aria-sort buttons.
- With virtual rows, screen readers still hear the total row count and each row's real position.
- Focus remains on native controls; loading and selected totals announced politely.

## Use cases

- Use basic, striped or bordered DataTable for row comparison with native table semantics, controlled sort and optional loaded-row selection.

## Limits

- The host sorts data and owns pagination and cross-page selection policy. Header select-all touches eligible loaded rows only.
- Virtual tables use one uniform effective row height. rowHeight defaults to a requested 48px minimum; observed enlarged content can raise the shared metric used by rows, slices and spacers. This does not support arbitrary variable-height rows. Supply width/maxWidth for variable columns.
- Only a final column may be pinned. Prefer one or two actions per row. Use grow for a flexible resource column; an explicit numeric width takes precedence.
- Use text(row) for full hover text when render returns truncated complex content.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- basic: example `variants`, visible label "basic".
- striped: example `variants`, visible label "striped".
- bordered: example `variants`, visible label "bordered".

### alignment

- start: example `variants`, visible label "Environment".
- end: example `variants`, visible label "Secrets".
- center: example `variants`, visible label "Present".

### collection

- native: example `semantic`, visible label "Fabricated environment inventory".
- empty: example `states`, visible label "Empty".
- protected-selection: example `states`, visible label "Protected selection".
- virtual: example `data-table`, visible label "Example resource table".

### column layout

- grow: example `variants`, visible label "Environment".
- pin: example `variants`, visible label "Open".
- hideHeader: example `variants`, visible label "Actions".

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/table/variants.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/button, @infisical/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn, EnvMark } from "../../../../components/v4/ui/data-table";
type Row = {
    id: string;
    name: string;
    count: number;
    present: boolean;
};
const rows: Row[] = [
    { id: "production", name: "Production", count: 128, present: true },
    { id: "staging", name: "Staging", count: 0, present: false }
];
export default function Variants() {
    const [opened, setOpened] = React.useState("");
    const columns: DataTableColumn<Row>[] = [
        {
            id: "name",
            header: "Environment",
            primary: true,
            grow: true,
            align: "start",
            render: (row) => row.name
        },
        { id: "count", header: "Secrets", align: "end", render: (row) => row.count },
        {
            id: "present",
            header: "Present",
            align: "center",
            render: (row) => <EnvMark present={row.present} env={row.name}/>
        },
        {
            id: "actions",
            header: "Actions",
            actions: true,
            pin: true,
            hideHeader: true,
            render: (row) => (<Button variant="ghost" aria-label={`Open ${row.name}`} onClick={() => setOpened(`${row.name} contains ${row.count} fabricated secrets.`)}>
          Open
        </Button>)
        }
    ];
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["basic", "striped", "bordered"] as const).map((variant) => (<figure key={variant} aria-label={`${variant} variant`} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <DataTable label={`${variant} environments`} rows={rows} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} variant={variant}/>
        </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
      <p role="status" className="sr-only">
        {opened}
      </p>
    </div>);
}
```

### Empty and protected selection

Save this example at `src/pages/design-system/examples/table/states.tsx`; its relative imports are generated for that exact path. States: empty, controlled, disabled, keyboard, loading.

Registry items used: @infisical/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { DataTable } from "../../../../components/v4/ui/data-table";
const initial = [
    { id: "owner", name: "Production owner", locked: true },
    { id: "worker", name: "Rotation worker", locked: false },
    { id: "expired", name: "Expired integration", locked: false }
];
const columns = [
    { id: "name", header: "Identity", render: (row: (typeof initial)[number]) => row.name },
    {
        id: "access",
        header: "Access",
        render: (row: (typeof initial)[number]) => (row.locked ? "Owner, protected" : "Revocable")
    }
];
export default function States() {
    const [selected, setSelected] = React.useState<string[]>(["worker"]);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Empty identities" rows={[]} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} empty="No identities in this environment"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Protected identities" rows={initial} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} selectable isSelectable={(row) => !row.locked} selectedIds={selected} onSelectionChange={setSelected} footer={`${selected.length} eligible loaded identities selected`}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Protected selection"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Loading identities" rows={initial} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} loadMore={{ label: "Load more identities", loading: true, onClick: () => undefined }}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading more, retained rows"}</figcaption></figure>
    </div>);
}
```

### Native semantic table

Save this example at `src/pages/design-system/examples/table/semantic.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";

export default function SemanticTable() {
  return (
    <Table aria-label="Environment inventory">
      <TableCaption>Fabricated environment inventory</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Environment</TableHead>
          <TableHead scope="col" className="text-right">
            Secrets
          </TableHead>
          <TableHead scope="col">Rotation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Production</TableCell>
          <TableCell className="text-right">128</TableCell>
          <TableCell>2 overdue</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Staging</TableCell>
          <TableCell className="text-right">0</TableCell>
          <TableCell>No secrets</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">128</TableCell>
          <TableCell>2 environments</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
```

### Sort direction

Save this example at `src/pages/design-system/examples/table/sorting.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
type Row = {
    id: string;
    key: string;
    updated: string;
};
const all: Row[] = [
    { id: "stripe", key: "STRIPE_API_KEY", updated: "2 days ago" },
    { id: "database", key: "DATABASE_URL", updated: "5 hours ago" },
    { id: "sendgrid", key: "SENDGRID_TOKEN", updated: "3 weeks ago" }
];
type Sort = {
    columnId: string;
    direction: "asc" | "desc";
};
const columns: DataTableColumn<Row>[] = [
    {
        id: "key",
        header: "Key",
        primary: true,
        sortable: true,
        text: (row) => row.key,
        render: (row) => row.key
    },
    { id: "updated", header: "Updated", render: (row) => row.updated }
];
function SortedTable({ label, initial }: {
    label: string;
    initial?: Sort;
}) {
    const [sort, setSort] = React.useState<Sort | undefined>(initial);
    const rows = sort
        ? [...all].sort((a, b) => a.key.localeCompare(b.key) * (sort.direction === "asc" ? 1 : -1))
        : all;
    return (<DataTable label={label} rows={rows} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.key} sort={sort} onSortChange={setSort}/>);
}
export default function Sorting() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <SortedTable label="Unsorted secrets"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Unsorted"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <SortedTable label="Ascending secrets" initial={{ columnId: "key", direction: "asc" }}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Ascending"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <SortedTable label="Descending secrets" initial={{ columnId: "key", direction: "desc" }}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Descending"}</figcaption></figure>
    </div>);
}
```

### Virtual rows and sorting

Save this example at `src/pages/design-system/examples/table/data-table.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard, overflow.

Registry items used: @infisical/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn, EnvMark } from "../../../../components/v4/ui/data-table";
type Row = {
    id: string;
    name: string;
    present: boolean;
};
const all: Row[] = Array.from({ length: 24 }, (_, index) => ({
    id: `resource-${index}`,
    name: `example_resource_${index}`,
    present: index % 3 !== 0
}));
export default function Example() {
    const [selected, setSelected] = useState<string[]>([]);
    const [sort, setSort] = useState<{
        columnId: string;
        direction: "asc" | "desc";
    }>();
    const rows = useMemo(() => sort
        ? [...all].sort((a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1))
        : all, [sort]);
    const columns: DataTableColumn<Row>[] = [
        {
            id: "name",
            header: "Name",
            primary: true,
            sortable: true,
            maxWidth: 240,
            text: (row) => row.name,
            render: (row) => row.name
        },
        {
            id: "environment",
            header: "Production",
            render: (row) => <EnvMark present={row.present} env="Production"/>
        }
    ];
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="relative min-w-0 w-full overflow-auto max-h-[400px]">
        <DataTable label="Example resource table" rows={rows} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} selectable selectedIds={selected} onSelectionChange={setSelected} sort={sort} height={320} virtual onSortChange={setSort} footer={`${rows.length} resources. ${selected.length} selected.`}/>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"Selection, sorting and virtual scrolling"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
