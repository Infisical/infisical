import * as React from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn, EnvMark } from "@app/components/v4/ui/data-table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Row = { id: string; name: string; count: number; present: boolean };
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
      render: (row) => <EnvMark present={row.present} env={row.name} />
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      pin: true,
      hideHeader: true,
      render: (row) => (
        <Button
          variant="ghost"
          aria-label={`Open ${row.name}`}
          onClick={() => setOpened(`${row.name} contains ${row.count} fabricated secrets.`)}
        >
          Open
        </Button>
      )
    }
  ];
  return (
    <ExampleGrid width="full">
      {(["basic", "striped", "bordered"] as const).map((variant) => (
        <ExampleCell
          align="stretch"
          key={variant}
          aria-label={`${variant} variant`}
          label={variant}
        >
          <DataTable
            label={`${variant} environments`}
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            variant={variant}
          />
        </ExampleCell>
      ))}
      <p role="status" className="sr-only">
        {opened}
      </p>
    </ExampleGrid>
  );
}
