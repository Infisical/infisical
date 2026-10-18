# Data grid

Spreadsheet selection and exact typed edits over stable row identities.

## Choose this component

Choose DataGrid for cell editing and rectangular selection. Use DataTable for row comparison and actions without spreadsheet keyboard semantics.

## Usage rules

### data-grid-usage

Owner: data-grid.

When a pasted range contains an invalid value or a changed permission.

Do: Validate the complete batch and current target identities before committing; keep exact strings and null distinct.

Avoid: Coerce values through Number, overwrite a host-updated cell, or apply only the valid part of a rejected paste.

Why: Partial or lossy updates can silently change values or write to the wrong cell.

Checked by: review only. Look for: Paste a range with one invalid cell and revoke permission during editing. No partial/lossy batch is applied, stable identities persist and protected cells remain unchanged.

Source evidence:
- src/components/v4/ui/data-grid.tsx
- src/pages/design-system/examples/data-grid/workspace.tsx

## State guidance

- editing: Keep the starting value and cancel or report conflict if permission or host data changes.
- failure: When a save fails, reject the whole change and keep a clear retry or cancel route.

## Presentation rules

Do: Keep keys, editable values, dirty cells and failures distinguishable within a shared column measure.

Avoid: Give every cell a bright badge, move rows on hover or use only short, valid data in an editing example.

Why: Stable columns keep exact values comparable. Nulls, protected fields and invalid batches expose failures that uniform valid data hides.

## Import and exports

- src/components/v4/ui/data-grid.tsx
- src/components/v4/ui/data-grid-model.ts
- src/components/v4/ui/data.module.css

Exports: DataGrid, GridColumn, GridChange, GridSelection, GridValue. Source TypeScript defines the API.

## Behavior

- Editable and read-only cells share range selection, copy and resize. rowHeight defaults to a requested 32px minimum. The measured content floor raises one uniform effective height used by cells, virtual positions and keyboard navigation; this is not arbitrary variable-height row support.
- Quoted TSV preserves null, literal NULL, empty text, embedded separators and quotes. Copy writes null as the unquoted marker \N, and paste reads an unquoted \N back as null.
- Invalid paste rejects the full batch. Async change failure keeps the edit draft.
- Rows and columns use stable ids through sorting, filtering and reordering. Keyboard selection scrolls the real active cell into view on both axes using measured header and viewport bounds.

## Accessibility

- The grid has a name and announces its row and column counts and the selected cell, even when that cell is scrolled out of view.
- Arrows, Home/End, PageUp/Down, Shift range, Enter/F2 edit, Escape cancel, Tab commit, mod+A/C/Z.
- Headers expose sorting buttons and keyboard-resizable separators.

## Use cases

- Use stable row and column ids, validate edits with a supported column type or column.parse, apply each onCellsChange all or nothing, and stop applying it when its signal aborts.

## Limits

- Values use exact strings or null. Named int2/smallint, int4/integer and int8/bigint codecs enforce signed 16/32/64-bit bounds without changing accepted text.
- numeric/decimal and floating-point codecs check syntax only. Hosts enforce precision, scale and storage range through column.parse; a custom parse callback owns validation.
- Changes are host-owned. The host must respect AbortSignal, apply a batch atomically and reject on failure.
- Delete writes explicit null only to nullable columns; Alt+Delete writes empty text.
- Sorting is delegated. Filtered selections retain identity, but navigating from an unavailable active cell starts at the first visible cell. Filtering away an edit cancels that draft.
- Sensitive cells are never readable, editable or copyable through this generic grid. Use a separate specialist editor.
- Undo applies the inverse of the last successful batch; cross-user conflict resolution belongs to the host.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### type


- text: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "text / unknown".
- unknown: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "text / unknown".
- int2: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int2 / smallint".
- smallint: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int2 / smallint".
- int4: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int4 / integer".
- integer: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int4 / integer".
- int8: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int8 / bigint".
- bigint: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "int8 / bigint".
- numeric: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".
- decimal: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".
- float4: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".
- float8: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".
- real: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".
- bool: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "bool / boolean".
- boolean: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "bool / boolean".
- uuid: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "uuid".
- json: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "json / jsonb".
- jsonb: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "json / jsonb".

### behavior

- virtual: example `workspace`, visible label "Example resources".
- host-conflict: omitted. Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews.
- permission-change: omitted. Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews.
- stale-commit: omitted. Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews.
- null: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "Nullable text".
- range-clipboard: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "Atomic range clipboard".
- custom-parse-format: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "Monthly cost in cents".
- protected-key: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "Protected key".
- sensitive: omitted. Cut to keep the page to the essentials; the data-grid fixture test renders it as "Sensitive value".

## Executable examples

### Editing and sorting

Save this example at `src/pages/design-system/examples/data-grid/workspace.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard, editing, error, overflow.

Registry items used: @infisical/data-grid. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { DataGrid, type GridColumn } from "../../../../components/v4/ui/data-grid";
type Row = {
    id: string;
    name: string;
    count: string;
    note: string | null;
};
const initial: Row[] = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    name: `resource_${i}`,
    count: i === 0 ? "9007199254740993" : String(i),
    note: i % 5 === 0 ? null : (["Example only", "NULL"][i === 1 ? 1 : 0] ?? "Example only")
}));
const columns: GridColumn<Row>[] = [
    {
        id: "name",
        header: "Name",
        type: "text",
        getValue: (row) => row.name,
        primaryKey: true,
        maxWidth: 220
    },
    { id: "count", header: "Count", type: "int8", getValue: (row) => row.count },
    { id: "note", header: "Note", type: "text", nullable: true, getValue: (row) => row.note }
];
function compareRows(a: Row, b: Row, columnId: string): number {
    if (columnId === "count") {
        const first = BigInt(a.count);
        const second = BigInt(b.count);
        if (first === second)
            return 0;
        return first < second ? -1 : 1;
    }
    const first = columnId === "note" ? a.note : a.name;
    const second = columnId === "note" ? b.note : b.name;
    if (first === second)
        return 0;
    if (first === null)
        return -1;
    if (second === null)
        return 1;
    return first.localeCompare(second);
}
export default function Example() {
    const [sort, setSort] = useState<{
        columnId: string;
        direction: "asc" | "desc";
    }>();
    const [rows, setRows] = useState(initial);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="relative min-w-0 w-full overflow-auto max-h-[400px]">
        <DataGrid label="Example resources" rows={rows} columns={columns} getRowId={(row) => row.id} editable height={320} sort={sort} onSortChange={(next) => {
            setSort(next);
            setRows((current) => [...current].sort((a, b) => compareRows(a, b, next.columnId) * (next.direction === "asc" ? 1 : -1)));
        }} onCellsChange={(changes) => {
            setRows((current) => current.map((row) => {
                let next = row;
                changes
                    .filter((cell) => cell.rowId === row.id)
                    .forEach((cell) => {
                    if (cell.columnId === "note")
                        next = { ...next, note: cell.value };
                    else if (cell.columnId === "count" && cell.value !== null)
                        next = { ...next, count: cell.value };
                });
                return next;
            }));
        }}/>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"Editable and sortable"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
