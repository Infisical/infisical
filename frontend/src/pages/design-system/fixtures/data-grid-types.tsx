import * as React from "react";

import { DataGrid, type GridColumn } from "@app/components/v4/ui/data-grid";
import { parseGridValue } from "@app/components/v4/ui/data-grid-model";

type Row = { id: string; type: string; label: string; value: string | null; invalid: string };
const initial: Row[] = [
  {
    id: "text",
    type: "text",
    label: "text / unknown",
    value: "NULL",
    invalid: "Any text is accepted"
  },
  {
    id: "int2",
    type: "int2",
    label: "int2 / smallint",
    value: "32767",
    invalid: "32768 exceeds int2"
  },
  {
    id: "int4",
    type: "int4",
    label: "int4 / integer",
    value: "2147483647",
    invalid: "2147483648 exceeds int4"
  },
  {
    id: "int8",
    type: "int8",
    label: "int8 / bigint",
    value: "9007199254740993",
    invalid: "9223372036854775808 exceeds int8"
  },
  {
    id: "numeric",
    type: "numeric",
    label: "numeric / decimal / float4 / float8 / real",
    value: "1.250e-9",
    invalid: "1,250 is invalid syntax"
  },
  { id: "bool", type: "bool", label: "bool / boolean", value: "false", invalid: "yes is invalid" },
  {
    id: "uuid",
    type: "uuid",
    label: "uuid",
    value: "00000000-0000-4000-8000-000000000001",
    invalid: "resource-1 is invalid"
  },
  {
    id: "json",
    type: "json",
    label: "json / jsonb",
    value: '{"rotation":null}',
    invalid: "{rotation:} is invalid"
  },
  {
    id: "nullable",
    type: "text",
    label: "Nullable text",
    value: null,
    invalid: "Delete writes null; Alt+Delete writes empty text"
  }
];
const columns: GridColumn<Row>[] = [
  {
    id: "type",
    header: "Type and equivalent aliases",
    getValue: (row) => row.label,
    editable: false,
    width: 310
  },
  {
    id: "value",
    header: "Exact value",
    getValue: (row) => row.value,
    width: 340,
    nullable: true,
    parse: (value, row) =>
      parseGridValue(
        {
          id: "value",
          header: row.type,
          type: row.type,
          nullable: row.id === "nullable",
          getValue: (item) => item.value
        },
        value,
        row
      )
  },
  {
    id: "invalid",
    header: "Validation boundary",
    getValue: (row) => row.invalid,
    editable: false,
    width: 350
  }
];
export default function Types() {
  const [rows, setRows] = React.useState(initial);
  return (
    <DataGrid
      label="Exact type validation"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      editable
      height={380}
      onCellsChange={(changes) =>
        setRows((current) =>
          current.map((row) => {
            const change = changes.find((cell) => cell.rowId === row.id);
            return change ? { ...row, value: change.value } : row;
          })
        )
      }
    />
  );
}
