import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Table,
  TableActionsHead,
  TableBody,
  TableHead,
  TableHeader,
  TableLoadingRows,
  TableRow
} from "@app/components/v4/ui/table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Secret = { id: string; key: string; production: string; staging: string };
const columns: DataTableColumn<Secret>[] = [
  { id: "key", header: "Key", primary: true, grow: true, render: (row) => row.key },
  { id: "production", header: "Production", width: 160, render: (row) => row.production },
  { id: "staging", header: "Staging", width: 160, render: (row) => row.staging }
];

export default function NativeLoading() {
  return (
    <ExampleGrid width="full">
      <ExampleCell
        align="stretch"
        label="Native Table with TableLoadingRows, as in a sheet or the secrets matrix"
      >
        <Table aria-label="Secrets, loading" aria-busy>
          <TableHeader>
            <TableRow>
              <TableHead selection />
              <TableHead scope="col">Key</TableHead>
              <TableHead scope="col" style={{ width: 160 }}>
                Production
              </TableHead>
              <TableHead scope="col" style={{ width: 160 }}>
                Staging
              </TableHead>
              <TableActionsHead slots={2} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoadingRows
              label="Loading secrets"
              rows={3}
              selectable
              actionSlots={2}
              columns={[{ primary: true }, { style: { width: 160 } }, { style: { width: 160 } }]}
            />
          </TableBody>
        </Table>
      </ExampleCell>
      <ExampleCell align="stretch" label="DataTable loading">
        <DataTable
          label="Secrets, loading"
          rows={[]}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.key}
          selectable
          loading
          loadingRows={3}
          rowActions={{
            inline: [
              { label: "Copy", icon: "copy", onSelect: () => {} },
              { label: "History", icon: "history", onSelect: () => {} }
            ]
          }}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
