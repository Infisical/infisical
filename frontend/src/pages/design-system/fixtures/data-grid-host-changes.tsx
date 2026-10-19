import { useState } from "react";

import { DataGrid, type GridColumn } from "@app/components/v4/ui/data-grid";

import { ExampleCell } from "../example-presentation";

type Row = { id: string; value: string; secret: string; cost: string };
const initial: Row[] = [
  { id: "production", value: "rotation overdue", secret: "fabricated-protected", cost: "1250" }
];
const columns: GridColumn<Row>[] = [
  { id: "id", header: "Protected key", primaryKey: true, getValue: (row) => row.id, width: 180 },
  { id: "value", header: "Rotation note", getValue: (row) => row.value, width: 250 },
  {
    id: "cost",
    header: "Monthly cost in cents",
    getValue: (row) => row.cost,
    width: 220,
    format: (value) => `${value ?? "0"} cents`,
    parse: (value) =>
      value !== null && /^\d{1,6}$/.test(value)
        ? { value }
        : { error: "Cost needs 0 to 999999 whole cents." }
  },
  {
    id: "secret",
    header: "Sensitive value",
    sensitive: true,
    getValue: (row) => row.secret,
    width: 190
  }
];
export default function Example() {
  const [rows, setRows] = useState(initial);
  return (
    <ExampleCell align="stretch" label="Primary key, custom parser and protected value">
      <DataGrid
        label="Protected and validated cells"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        editable
        height={150}
        onCellsChange={(changes) => {
          setRows((current) =>
            current.map((row) => {
              let next = row;
              changes.forEach((cell) => {
                if (cell.rowId === row.id && cell.value !== null) {
                  if (cell.columnId === "value") next = { ...next, value: cell.value };
                  if (cell.columnId === "cost") next = { ...next, cost: cell.value };
                }
              });
              return next;
            })
          );
        }}
      />
    </ExampleCell>
  );
}
