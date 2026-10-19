import { DataGrid } from "@app/components/v4/ui/data-grid";

import { ExampleCell, ExampleGrid } from "../example-presentation";

const columns = [
  {
    id: "name",
    header: "Resource",
    width: 480,
    getValue: (row: { id: string; name: string }) => row.name
  }
];
export default function States() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Empty">
        <DataGrid
          label="Empty grid"
          rows={[]}
          columns={columns}
          getRowId={(row) => row.id}
          empty="No resources in this environment"
        />
      </ExampleCell>
      <ExampleCell align="stretch" label="One row, read-only">
        <DataGrid
          label="Read-only grid"
          rows={[{ id: "archived", name: "Archived resource with a long deployment identifier" }]}
          columns={columns}
          getRowId={(row) => row.id}
          height={130}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
