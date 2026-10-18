import * as React from "react";

import { DataTable } from "@app/components/v4/ui/data-table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const initial = [
  { id: "owner", name: "Production owner", locked: true },
  { id: "worker", name: "Rotation worker", locked: false },
  { id: "expired", name: "Expired integration", locked: false }
];
const columns = [
  { id: "name", header: "Identity", render: (row: (typeof initial)[number]) => row.name },
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
          empty="No identities in this environment"
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
          isSelectable={(row) => !row.locked}
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
