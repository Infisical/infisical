import * as React from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { DataTable } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const initial = [
  { id: "owner", name: "Production owner", locked: true, deactivated: false },
  { id: "worker", name: "Rotation worker", locked: false, deactivated: false },
  { id: "expired", name: "Expired integration", locked: false, deactivated: true }
];
const columns = [
  {
    id: "name",
    header: "Identity",
    render: (row: (typeof initial)[number]) => (
      <span className="inline-flex items-center gap-2">
        {row.name}
        {row.deactivated && <Badge size="sm">Deactivated</Badge>}
      </span>
    )
  },
  {
    id: "access",
    header: "Access",
    render: (row: (typeof initial)[number]) => (row.locked ? "Owner, protected" : "Revocable")
  }
];
export default function States() {
  const [selected, setSelected] = React.useState<string[]>(["worker"]);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Empty">
        <DataTable
          label="Empty identities"
          rows={[]}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="user"
              title="No identities in this environment"
            />
          }
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Protected selection">
        <DataTable
          label="Protected identities"
          rows={initial}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          selectable
          selectionDisabledReason={(row) =>
            row.locked ? "Owner identities are protected from bulk removal." : undefined
          }
          selectedIds={selected}
          onSelectionChange={setSelected}
          footer={`${selected.length} eligible loaded identities selected`}
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="Loading more, retained rows">
        <DataTable
          label="Loading identities"
          rows={initial}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          loadMore={{ label: "Load more identities", loading: true, onClick: () => undefined }}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
