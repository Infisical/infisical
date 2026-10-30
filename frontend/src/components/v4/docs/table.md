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

Avoid: Make a row click select the row as well as open it, or claim every result is selected when only loaded ids changed.

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

### table-row-action-geometry

Owner: table.

When a table row shows icon actions, standalone indicator marks or both.

Do: Put the actions in TableRowActions as Button size icon-row and the marks in TableRowIndicators. Choose which actions and marks a row shows and their order; leave target, glyph, gap, inset and reveal to the primitives and tokens.

Avoid: Use icon-xs or icon-sm for row actions, size marks with Icon size, add a local gap or negative margin, or hide resting actions with display none.

Why: One owner keeps glyphs 16px at rest and on hover, lands them on the 12px content edge, keeps 28px targets from overlapping and keeps hidden actions in the tab order.

Checked by: review only. Look for: Measure a row at rest, on hover and with keyboard focus: row 40, targets 28 that touch without overlapping, glyphs 16 with the last glyph 12px from the cell edge, and a 36px focus box fully inside the row. Tab reaches every action, and an open menu keeps its actions shown.

Source evidence:
- src/components/v4/ui/table.tsx
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/table/row-actions.tsx

### table-row-activation

Owner: table.

When each row opens one detail page or sheet for its resource.

Do: Pass onRowActivate with the same destination as the link or button in the primary cell, and keep selection on the checkbox and Space.

Avoid: Navigate from a cell's own onClick, give the row a button or link role, or let a row click change the selection.

Why: One handler keeps pointer, Enter and the named control in agreement, while the row's own controls keep their clicks and the row keeps native table semantics.

Checked by: src/components/v4/ui/data-table.test.tsx. Clicks a cell, the row menu, the selection cell and a text selection, then presses Enter and Space on a focused row; only the cell click and Enter activate, and Space selects.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data-table.test.tsx
- src/pages/design-system/examples/table/row-activation.tsx

### table-loading-geometry

Owner: table.

When a DataTable waits for its first rows or reloads them.

Do: Pass loading and a loadingRows count close to the page size, and declare a width on every column except the one that grows, so the table uses fixed layout.

Avoid: Swap the table for a Loader, or leave columns sized by content so they jump when rows arrive.

Why: Skeleton rows at the loaded row height and column widths keep the page still when the data replaces them.

Checked by: src/components/v4/ui/data-table.test.tsx. Compares each cell's width style between loading and loaded rows and checks fixed layout only when every column has a width or grows.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/loading.tsx

## State guidance

- hover and focus: Reveal actions appear on hover and on keyboard focus with no change in glyph size or row height. Tab reaches every action while it rests hidden, and an open menu keeps its actions shown and anchored to its trigger.
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
- src/components/v4/ui/data-table.test.tsx
- src/components/v4/ui/frame.module.css
- src/components/v4/tokens.json

Exports: DataTable, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter, TableCaption, TableRowActions, TableRowActionsSeparator, TableRowIndicators, DataTableColumn, DataTableToggle, EnvMark. Source TypeScript defines the API.

## Behavior

- A hovered row uses a translucent ink overlay at the opacity-hover token; a pinned cell lays the same overlay over its opaque surface so scrolled cells never show through it.
- DataTable composes existing Table parts without imposing ARIA grid keyboard semantics.
- DataTable sits in the shared tint frame: the column header row is a 40px uppercase eyebrow row in the frame and the body rows sit on the inset raised surface.
- Basic/striped/bordered, controlled sorting, stable selection, empty and load-more.
- Sortable headers show the direction with a custom-set arrow: up for ascending and down for descending, always visible on the sorted column. An unsorted column shows the up arrow it would apply only while its header is hovered or focused. The sorted header steps up to ink.
- Content sizing floors, capped values, pinned action column and optional fixed-height row virtualization.
- Rows are size-row (40px) through one variable, --v4-table-row-height, which falls back to the token; DataTable reads size-row at runtime as its default virtual metric, so the CSS row and the scroll model never disagree. Cells pad by space-row-inline (12px), the content edge text and glyphs share.
- TableRowActions owns row action layout: targets touch (space-row-actions-gap, 0), and a trailing icon-row target pulls into the cell padding by (size-target-row - size-glyph) / 2, so its 16px glyph lands on the 12px content edge. With reveal, the actions rest visually hidden but stay in the tab order, show while their leaf row is hovered or holds focus, and stay shown while a menu or popover they opened is open (aria-expanded true, or open on the slot). A row that hosts a nested table never reveals the nested rows' actions. TableRowActionsSeparator divides groups of actions with a glyph-tall line.
- TableRowIndicators lays standalone row marks in size-target-row slots with size-glyph glyphs and the same pull, so a mark and an action share one glyph size and one end edge. With swap, the indicators hide while the row's reveal actions show, for marks the actions repeat; without it they stay beside the actions.
- Responsibilities: tokens own the numbers (size-row, size-target-row, size-glyph, space-row-inline, space-row-actions-gap); Button icon-row, TableRowActions and TableRowIndicators own geometry and reveal behavior; a composite chooses which actions and indicators a row shows and their order, and sets no sizes, gaps or offsets.
- With a fixed height, load-more sits in flow after the last loaded row, inside the scroll frame, so nothing covers readable rows; the outline button morphs to its loading state in place. Once loadMore is undefined, the optional end message takes the same slot.
- onRowActivate makes every row a pointer target with the ordinary hover overlay. A click anywhere in the row activates it unless it lands on a link, button, input, checkbox, menu item, tooltip trigger, the selection cell, the actions cell or anything marked data-row-interactive, or it ends a text selection inside the row. Menu items rendered in a portal never reach the row.
- pagination renders its node in a foot inside the tint frame, below the rows. It stays in view while a wide table scrolls sideways and, with a fixed height, while the rows scroll.
- loading replaces the rows with loadingRows (default 5) skeleton rows at the same row height: a square for the selection and actions cells and a size-skeleton-text bar for each value, shorter in the primary column. Empty and load-more stay hidden while loading.
- When every column declares a width, or grows to fill the rest, the table uses fixed layout with a floor of the declared widths plus size-cell-min per growing column, so widths never move between loading and loaded rows or as cell content changes.
- actionBar hosts the table's FloatingActionBar. While the bar shows, the table reserves size-action-bar plus the bar's offset (space-action-bar-offset, or space-action-bar-offset-contained) below itself, so the last row can scroll clear of the bar.
- A column with toggle is a boolean column: every cell is a Checkbox and the header gets a tri-state Checkbox before its title. The header reads checked when every enabled row is on, indeterminate when some are, and unchecked when none are. Selecting it turns every enabled row on, or off when all are on, and calls onChange once with only the row ids that change. Rows with a disabledReason keep their value, are left out of the count, and show the reason on their disabled cell; with no enabled rows the header is disabled. render is optional on a toggle column.

## Accessibility

- Native table/header/cell semantics, labelled selection and aria-sort buttons.
- With virtual rows, screen readers still hear the total row count and each row's real position.
- Focus remains on native controls; loading and selected totals announced politely.
- After load-more appends rows, the table scrolls the first new row into view and moves focus to it, so keyboard and screen reader users continue from what just arrived.
- With onRowActivate, rows join the tab order without an interactive role, so the table keeps native row semantics and never nests a button or link role around the row's own controls. Enter activates the focused row and Space toggles its selection when the table is selectable. Keep a real link or button for the same destination in the primary cell, so screen reader users meet a named control.
- Loading rows are hidden from assistive technology; the table is aria-busy and the polite status says Loading rows.
- Toggle checkboxes are named, not left to the header: each cell is "<header> for <rowLabel>" and the header control is "<header> for every row in <label>" unless toggle.label overrides it. The header control announces mixed for some. A disabled cell carries its reason as its accessible description.

## Use cases

- Use basic, striped or bordered DataTable for row comparison with native table semantics, controlled sort and optional loaded-row selection.

## Limits

- The host sorts data and owns pagination and cross-page selection policy. Header select-all touches eligible loaded rows only.
- Virtual tables use one uniform effective row height. rowHeight defaults to the size-row token (40px) as a requested minimum; observed enlarged content can raise the shared metric used by rows, slices and spacers. This does not support arbitrary variable-height rows. Supply width/maxWidth for variable columns.
- Only a final column may be pinned. Prefer one or two actions per row. Use grow for a flexible resource column; an explicit numeric width takes precedence.
- Use text(row) for full hover text when render returns truncated complex content.
- The host owns how many rows load and how tall the frame grows; pass a larger height as rows arrive, leave loadMore undefined once every row is loaded and pass end to say so. Remount or reset scroll when a filter replaces the rows.
- onRowActivate is a pointer and keyboard shortcut. It cannot open a new tab or be copied as a link; navigation that needs those belongs on the link in the primary cell.
- The pagination slot takes any node. The host slices rows, owns page and page size, and resets the page when filters change.
- Only a FloatingActionBar passed through actionBar reserves space. A bar rendered elsewhere on the page cannot reach the table.
- A toggle column acts on the rows passed in. With pagination the header counts and sets the current page only; the host decides whether a bulk change spans pages. The host owns the values and persists them through onChange.

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
- load-more: example `load-more`, visible label "Example event log".
- row-activation: example `row-activation`, visible label "Certificates".
- paginated: example `pagination`, visible label "Audit events".
- loading: example `loading`, visible label "Keys, loading".

### column layout

- grow: example `variants`, visible label "Environment".
- pin: example `variants`, visible label "Open".
- hideHeader: example `variants`, visible label "Actions".

### row actions

- reveal: example `row-actions`, visible label "DATABASE_URL".
- persistent: example `row-actions`, visible label "JWT_SIGNING_KEY override".
- indicators: example `row-actions`, visible label "DATABASE_URL".
- separator: example `row-actions`, visible label "DATABASE_URL".

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

Registry items used: @infisical/data-table, @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { DataTable } from "../../../../components/v4/ui/data-table";
import { EmptyState } from "../../../../components/v4/ui/empty";
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
        <DataTable label="Empty identities" rows={[]} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} empty={<EmptyState size="sm" media="bare" icon="user" title="No identities in this environment"/>}/>
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

### Virtual rows, load more

Save this example at `src/pages/design-system/examples/table/load-more.tsx`; its relative imports are generated for that exact path. States: default, loading, keyboard.

Registry items used: @infisical/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
type Row = {
    id: string;
    name: string;
    time: string;
};
const total = 200;
const page = 40;
const makeRows = (from: number, count: number): Row[] => Array.from({ length: Math.min(count, total - from) }, (_, offset) => {
    const minutes = 23 * 60 + 59 - (from + offset) * 7;
    return {
        id: `event-${from + offset}`,
        name: `example_event_${from + offset}`,
        time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    };
});
const columns: DataTableColumn<Row>[] = [
    { id: "time", header: "Time", width: 120, render: (row) => row.time },
    { id: "name", header: "Event", primary: true, grow: true, render: (row) => row.name }
];
export default function Example() {
    const [rows, setRows] = useState(() => makeRows(0, page));
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!loading)
            return undefined;
        const timer = window.setTimeout(() => {
            setRows((current) => [...current, ...makeRows(current.length, page)]);
            setLoading(false);
        }, 600);
        return () => window.clearTimeout(timer);
    }, [loading]);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="relative min-w-0 w-full overflow-auto max-h-[400px]">
        <DataTable label="Example event log" rows={rows} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} height={320} rowHeight={48} virtual loadMore={rows.length < total
            ? { label: `Load ${page} more`, loading, onClick: () => setLoading(true) }
            : undefined} end="End of events" footer={`Showing ${rows.length} of ${total} events`}/>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"Load more after the last row, focus lands on the first new row"}</figcaption></figure>);
}
```

### Row actions and indicators

Save this example at `src/pages/design-system/examples/table/row-actions.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @infisical/button, @infisical/dropdown-menu, @infisical/icon, @infisical/layout, @infisical/table. Additional packages: lucide-react@^0.544.0. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { BellIcon, CodeXmlIcon } from "lucide-react";

import { Button } from "../../../../components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { Inline } from "../../../../components/v4/ui/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowActionsSeparator,
  TableRowIndicators
} from "../../../../components/v4/ui/table";

const rows = [
  { id: "database-url", name: "DATABASE_URL", annotated: true },
  { id: "log-level", name: "LOG_LEVEL", annotated: false }
];

export default function RowActions() {
  const [status, setStatus] = React.useState("");
  return (
    <>
      <Table aria-label="Example secrets with row actions">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Name</TableHead>
            <TableHead scope="col">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                <Inline gap={8} wrap={false}>
                  <code>••••••••••••</code>
                  {row.annotated && (
                    <TableRowIndicators swap>
                      <span>
                        <Icon icon={BellIcon} label="Has reminder" />
                      </span>
                      <span>
                        <Icon icon={CodeXmlIcon} label="Has metadata" />
                      </span>
                    </TableRowIndicators>
                  )}
                  <TableRowActions reveal>
                    {row.annotated && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-row"
                          icon="bell"
                          iconOnly
                          onClick={() => setStatus(`Opened the reminder for ${row.name}.`)}
                        >
                          {`View reminder for ${row.name}`}
                        </Button>
                        <TableRowActionsSeparator />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-row"
                      icon="copy"
                      iconOnly
                      onClick={() => setStatus(`Copied the fabricated value of ${row.name}.`)}
                    >
                      {`Copy ${row.name}`}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                          {`More actions for ${row.name}`}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setStatus(`Opened ${row.name}.`)}>
                          Open secret
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableRowActions>
                </Inline>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>JWT_SIGNING_KEY override</TableCell>
            <TableCell>
              <Inline gap={8} wrap={false}>
                <code>••••••••••••</code>
                <TableRowActions>
                  <Button
                    variant="ghost"
                    size="icon-row"
                    icon="copy"
                    iconOnly
                    onClick={() => setStatus("Copied the fabricated override.")}
                  >
                    Copy override
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-row"
                    icon="trash"
                    iconOnly
                    onClick={() => setStatus("Removed the fabricated override.")}
                  >
                    Remove override
                  </Button>
                </TableRowActions>
              </Inline>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p role="status" className="sr-only">
        {status}
      </p>
    </>
  );
}
```

### Row activation

Save this example at `src/pages/design-system/examples/table/row-activation.tsx`; its relative imports are generated for that exact path. States: default, keyboard, controlled.

Registry items used: @infisical/button, @infisical/data-table, @infisical/dropdown-menu, @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../../components/v4/ui/dropdown-menu";
import { Meta } from "../../../../components/v4/ui/text";
type Cert = {
    id: string;
    cn: string;
    serial: string;
    expires: string;
};
const certs: Cert[] = [
    { id: "api", cn: "api.example.com", serial: "4f:1c:9a:02", expires: "2026-12-04" },
    { id: "auth", cn: "auth.example.com", serial: "7b:20:e1:5d", expires: "2027-02-18" },
    { id: "billing", cn: "billing.example.com", serial: "0e:93:44:c8", expires: "2027-05-30" }
];
export default function RowActivation() {
    const [status, setStatus] = React.useState("Nothing opened yet.");
    const [selected, setSelected] = React.useState<string[]>([]);
    const open = (cert: Cert) => setStatus(`Opened ${cert.cn}.`);
    const columns: DataTableColumn<Cert>[] = [
        {
            id: "cn",
            header: "Common name",
            primary: true,
            grow: true,
            text: (row) => row.cn,
            render: (row) => (<Button variant="link" onClick={() => open(row)}>
          {row.cn}
        </Button>)
        },
        { id: "serial", header: "Serial", width: 136, render: (row) => row.serial },
        { id: "expires", header: "Expires", width: 120, render: (row) => row.expires },
        {
            id: "actions",
            header: "Actions",
            actions: true,
            width: 52,
            render: (row) => (<DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${row.cn}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setStatus(`Renewal requested for ${row.cn}.`)}>
              Renew
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>)
        }
    ];
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Certificates" rows={certs} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.cn} selectable selectedIds={selected} onSelectionChange={setSelected} onRowActivate={open} footer={<Meta mono={false}>{status}</Meta>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Whole row opens the certificate"}</figcaption></figure>
    </div>);
}
```

### Pagination

Save this example at `src/pages/design-system/examples/table/pagination.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/data-table, @infisical/pagination. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Pagination } from "../../../../components/v4/ui/pagination";
type Event = {
    id: string;
    actor: string;
    action: string;
    at: string;
};
const actors = ["ci-deployer", "sarah@acme.dev", "rotation-worker", "k8s-operator"];
const actions = ["secret.read", "secret.update", "identity.login", "key.rotate"];
const events: Event[] = Array.from({ length: 132 }, (_, index) => ({
    id: `event-${index + 1}`,
    actor: actors[index % actors.length],
    action: actions[(index * 3) % actions.length],
    at: `2026-10-${String(28 - (index % 28)).padStart(2, "0")}`
}));
const columns: DataTableColumn<Event>[] = [
    { id: "actor", header: "Actor", primary: true, grow: true, render: (row) => row.actor },
    { id: "action", header: "Action", width: 160, render: (row) => row.action },
    { id: "at", header: "Date", width: 120, render: (row) => row.at }
];
export default function PaginationSlot() {
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(20);
    const rows = events.slice((page - 1) * pageSize, page * pageSize);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Audit events" rows={rows} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => `${row.actor} ${row.action}`} pagination={<Pagination label="Audit event pages" variant="compact" page={page} onPageChange={setPage} total={events.length} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} onPageSizeChange={setPageSize}/>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Rows per page, range and previous and next"}</figcaption></figure>
    </div>);
}
```

### Loading rows

Save this example at `src/pages/design-system/examples/table/loading.tsx`; its relative imports are generated for that exact path. States: loading, default.

Registry items used: @infisical/badge, @infisical/button, @infisical/data-table, @infisical/layout. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Stack } from "../../../../components/v4/ui/layout";
type Key = {
    id: string;
    name: string;
    algorithm: string;
    status: "active" | "disabled";
};
const keys: Key[] = [
    { id: "backup", name: "backup-signing", algorithm: "AES-256-GCM", status: "active" },
    { id: "billing", name: "billing-pii", algorithm: "AES-256-GCM", status: "active" },
    { id: "legacy", name: "legacy-exports", algorithm: "AES-128-GCM", status: "disabled" }
];
const columns: DataTableColumn<Key>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    { id: "algorithm", header: "Algorithm", width: 136, render: (row) => row.algorithm },
    {
        id: "status",
        header: "Status",
        width: 112,
        render: (row) => row.status === "active" ? (<Badge tone="ok" dot>
          Active
        </Badge>) : (<Badge tone="outline">Disabled</Badge>)
    },
    {
        id: "actions",
        header: "Actions",
        actions: true,
        width: 52,
        render: (row) => (<Button variant="ghost" size="icon-row" icon="more" iconOnly>
        {`Actions for ${row.name}`}
      </Button>)
    }
];
function KeyTable({ label, loading }: {
    label: string;
    loading?: boolean;
}) {
    return (<DataTable label={label} rows={keys} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.name} selectable loading={loading} loadingRows={3}/>);
}
export default function Loading() {
    const [reloading, setReloading] = React.useState(false);
    React.useEffect(() => {
        if (!reloading)
            return undefined;
        const timer = window.setTimeout(() => setReloading(false), 1200);
        return () => window.clearTimeout(timer);
    }, [reloading]);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <KeyTable label="Keys, loading" loading/>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <KeyTable label="Keys, loaded"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Loaded"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Stack gap={12}>
          <div>
            <Button variant="outline" disabled={reloading} onClick={() => setReloading(true)}>
              Reload keys
            </Button>
          </div>
          <KeyTable label="Keys, reloadable" loading={reloading}/>
        </Stack>
      </div><figcaption className="text-muted-foreground text-xs">{"Reload in place"}</figcaption></figure>
    </div>);
}
```

### Column toggle, permission matrix

Save this example at `src/pages/design-system/examples/table/column-toggle.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard, controlled.

Registry items used: @infisical/data-table, @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Meta } from "../../../../components/v4/ui/text";
type Action = "read" | "create" | "edit" | "delete";
type Policy = {
    id: string;
    subject: string;
    managed?: boolean;
    allowed: Action[];
};
const actions: {
    id: Action;
    header: string;
}[] = [
    { id: "read", header: "Read" },
    { id: "create", header: "Create" },
    { id: "edit", header: "Edit" },
    { id: "delete", header: "Delete" }
];
const initial: Policy[] = [
    { id: "secrets", subject: "Secrets", allowed: ["read", "create", "edit"] },
    { id: "folders", subject: "Secret folders", allowed: ["read"] },
    { id: "imports", subject: "Secret imports", allowed: [] },
    { id: "rotation", subject: "Secret rotation", allowed: ["read"] },
    { id: "audit", subject: "Audit logs", managed: true, allowed: ["read"] }
];
export default function ColumnToggle() {
    const [policies, setPolicies] = React.useState(initial);
    const [status, setStatus] = React.useState("No changes yet.");
    const columns: DataTableColumn<Policy>[] = [
        {
            id: "subject",
            header: "Policy",
            primary: true,
            grow: true,
            text: (row) => row.subject,
            render: (row) => row.subject
        },
        ...actions.map((action): DataTableColumn<Policy> => ({
            id: action.id,
            header: action.header,
            width: 112,
            toggle: {
                checked: (row) => row.allowed.includes(action.id),
                disabledReason: (row) => row.managed ? "Managed by Infisical. Audit log access cannot change." : undefined,
                onChange: (ids, checked) => {
                    setPolicies((current) => current.map((row) => ids.includes(row.id)
                        ? {
                            ...row,
                            allowed: checked
                                ? [...row.allowed, action.id]
                                : row.allowed.filter((item) => item !== action.id)
                        }
                        : row));
                    setStatus(`${checked ? "Allowed" : "Removed"} ${action.header.toLowerCase()} on ${ids.length} ${ids.length === 1 ? "policy" : "policies"}.`);
                }
            }
        }))
    ];
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <DataTable label="Developer role permissions" rows={policies} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.subject}/>
      <Meta role="status">{status}</Meta>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
