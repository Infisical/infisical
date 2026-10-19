import { useState } from "react";

import { DataGrid, type GridColumn } from "@app/components/v4/ui/data-grid";

import { ExampleCell, ExampleStage } from "../../example-presentation";

type Row = { id: string; name: string; count: string; note: string | null };
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
    if (first === second) return 0;
    return first < second ? -1 : 1;
  }
  const first = columnId === "note" ? a.note : a.name;
  const second = columnId === "note" ? b.note : b.name;
  if (first === second) return 0;
  if (first === null) return -1;
  if (second === null) return 1;
  return first.localeCompare(second);
}
export default function Example() {
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>();
  const [rows, setRows] = useState(initial);
  return (
    <ExampleCell align="stretch" label="Editable and sortable">
      <ExampleStage height="data">
        <DataGrid
          label="Example resources"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          editable
          height={320}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setRows((current) =>
              [...current].sort(
                (a, b) => compareRows(a, b, next.columnId) * (next.direction === "asc" ? 1 : -1)
              )
            );
          }}
          onCellsChange={(changes) => {
            setRows((current) =>
              current.map((row) => {
                let next = row;
                changes
                  .filter((cell) => cell.rowId === row.id)
                  .forEach((cell) => {
                    if (cell.columnId === "note") next = { ...next, note: cell.value };
                    else if (cell.columnId === "count" && cell.value !== null)
                      next = { ...next, count: cell.value };
                  });
                return next;
              })
            );
          }}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
