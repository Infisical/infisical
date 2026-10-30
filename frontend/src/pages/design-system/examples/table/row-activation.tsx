import * as React from "react";

import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Meta } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Cert = { id: string; cn: string; serial: string; expires: string };
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
      render: (row) => (
        <Button variant="link" onClick={() => open(row)}>
          {row.cn}
        </Button>
      )
    },
    { id: "serial", header: "Serial", width: 136, render: (row) => row.serial },
    { id: "expires", header: "Expires", width: 120, render: (row) => row.expires },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      width: 52,
      render: (row) => (
        <DropdownMenu>
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
        </DropdownMenu>
      )
    }
  ];
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Whole row opens the certificate">
        <DataTable
          label="Certificates"
          rows={certs}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.cn}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowActivate={open}
          footer={<Meta mono={false}>{status}</Meta>}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
