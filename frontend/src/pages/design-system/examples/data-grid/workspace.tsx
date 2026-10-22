import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataGrid, type GridColumn, type NewGridColumn } from "@app/components/v4/ui/data-grid";

import { ExampleCell, ExampleStage } from "../../example-presentation";

type Row = {
  id: string;
  name: string;
  count: string;
  note: string | null;
  extra: Record<string, string | null>;
};
const initial: Row[] = Array.from({ length: 6 }, (_, i) => ({
  id: `r${i}`,
  name: `resource_${i}`,
  count: i === 0 ? "9007199254740993" : String(i),
  note: i % 5 === 0 ? null : (["Example only", "NULL"][i === 1 ? 1 : 0] ?? "Example only"),
  extra: {}
}));
const baseColumns: GridColumn<Row>[] = [
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
  const valueOf = (row: Row) => {
    if (columnId === "note") return row.note;
    if (columnId === "name") return row.name;
    return row.extra[columnId];
  };
  const first = valueOf(a);
  const second = valueOf(b);
  if (first === second) return 0;
  if (first === null || first === undefined) return -1;
  if (second === null || second === undefined) return 1;
  return first.localeCompare(second);
}
export default function Example() {
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>();
  const [rows, setRows] = useState(initial);
  const [added, setAdded] = useState<NewGridColumn[]>([]);
  const [next, setNext] = useState(initial.length);
  const columns: GridColumn<Row>[] = [
    ...baseColumns,
    ...added.map(
      (column): GridColumn<Row> => ({
        id: column.name,
        header: column.name,
        type: column.type,
        nullable: column.nullable,
        getValue: (row) => row.extra[column.name] ?? null
      })
    )
  ];
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
          onSortChange={(nextSort) => {
            setSort(nextSort);
            setRows((current) =>
              [...current].sort(
                (a, b) =>
                  compareRows(a, b, nextSort.columnId) * (nextSort.direction === "asc" ? 1 : -1)
              )
            );
          }}
          onAddColumn={(column) =>
            setAdded((current) =>
              current.some((entry) => entry.name === column.name) ? current : [...current, column]
            )
          }
          onAddRow={() => {
            const id = `r${next}`;
            setNext(next + 1);
            setRows((current) => [
              ...current,
              { id, name: `resource_${next}`, count: "0", note: null, extra: {} }
            ]);
            return id;
          }}
          onAddRowCancel={(id) => setRows((current) => current.filter((row) => row.id !== id))}
          footer={
            <>
              <span>
                {rows.length} rows, {columns.length} columns
              </span>
              {added.length > 0 && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setAdded((current) => current.slice(0, -1))}
                >
                  Undo add column
                </Button>
              )}
            </>
          }
          onCellsChange={(changes) => {
            setRows((current) =>
              current.map((row) => {
                let nextRow = row;
                changes
                  .filter((cell) => cell.rowId === row.id)
                  .forEach((cell) => {
                    if (cell.columnId === "note") nextRow = { ...nextRow, note: cell.value };
                    else if (cell.columnId === "count" && cell.value !== null)
                      nextRow = { ...nextRow, count: cell.value };
                    else if (cell.columnId === "name" && cell.value !== null)
                      nextRow = { ...nextRow, name: cell.value };
                    else
                      nextRow = {
                        ...nextRow,
                        extra: { ...nextRow.extra, [cell.columnId]: cell.value }
                      };
                  });
                return nextRow;
              })
            );
          }}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
