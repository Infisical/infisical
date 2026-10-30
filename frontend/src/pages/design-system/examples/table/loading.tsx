import * as React from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Stack } from "@app/components/v4/ui/layout";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Key = { id: string; name: string; algorithm: string; status: "active" | "disabled" };
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
    render: (row) =>
      row.status === "active" ? (
        <Badge tone="ok" dot>
          Active
        </Badge>
      ) : (
        <Badge tone="outline">Disabled</Badge>
      )
  },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    width: 52,
    render: (row) => (
      <Button variant="ghost" size="icon-row" icon="more" iconOnly>
        {`Actions for ${row.name}`}
      </Button>
    )
  }
];

function KeyTable({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <DataTable
      label={label}
      rows={keys}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      loading={loading}
      loadingRows={3}
    />
  );
}

export default function Loading() {
  const [reloading, setReloading] = React.useState(false);
  React.useEffect(() => {
    if (!reloading) return undefined;
    const timer = window.setTimeout(() => setReloading(false), 1200);
    return () => window.clearTimeout(timer);
  }, [reloading]);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Loading">
        <KeyTable label="Keys, loading" loading />
      </ExampleCell>
      <ExampleCell align="stretch" label="Loaded">
        <KeyTable label="Keys, loaded" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Reload in place">
        <Stack gap={12}>
          <div>
            <Button variant="outline" disabled={reloading} onClick={() => setReloading(true)}>
              Reload keys
            </Button>
          </div>
          <KeyTable label="Keys, reloadable" loading={reloading} />
        </Stack>
      </ExampleCell>
    </ExampleGrid>
  );
}
