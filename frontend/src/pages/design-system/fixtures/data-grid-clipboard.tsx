import * as React from "react";

import { DataGrid, type GridColumn } from "@app/components/v4/ui/data-grid";

import { ExampleStack } from "../example-presentation";

type Row = { id: string; count: string; note: string | null };
const initial: Row[] = [
  { id: "a", count: "1", note: 'quoted "value"\twith tab\nand newline' },
  { id: "b", count: "2", note: null },
  { id: "c", count: "3", note: "NULL" },
  { id: "d", count: "4", note: "" }
];
const columns: GridColumn<Row>[] = [
  { id: "count", header: "Count", type: "int8", getValue: (row) => row.count, width: 200 },
  {
    id: "note",
    header: "Nullable note",
    nullable: true,
    getValue: (row) => row.note,
    width: 320
  }
];
export default function Clipboard() {
  const [rows, setRows] = React.useState(initial);
  const [result, setResult] = React.useState("No batch applied");
  return (
    <ExampleStack>
      <div className="w-full min-w-0">
        <DataGrid
          label="Atomic range clipboard"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          editable
          height={220}
          onCellsChange={(changes) => {
            setRows((current) =>
              current.map((row) => {
                let next = row;
                changes
                  .filter((cell) => cell.rowId === row.id)
                  .forEach((cell) => {
                    if (cell.columnId === "count" && cell.value !== null)
                      next = { ...next, count: cell.value };
                    if (cell.columnId === "note") next = { ...next, note: cell.value };
                  });
                return next;
              })
            );
            setResult(`${changes.length} cells applied in one local batch`);
          }}
          onCopy={(_, count) => setResult(`${count} cells copied`)}
        />
      </div>
      <p role="status" className="sr-only">
        {result}
      </p>
    </ExampleStack>
  );
}
