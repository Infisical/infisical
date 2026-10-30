import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn, EnvMark } from "@app/components/v4/ui/data-table";

import { ExampleCell, ExampleStage } from "../../example-presentation";

type Row = { id: string; name: string; present: boolean };
const all: Row[] = Array.from({ length: 24 }, (_, index) => ({
  id: `resource-${index}`,
  name: `example_resource_${index}`,
  present: index % 3 !== 0
}));
export default function Example() {
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>();
  const rows = useMemo(
    () =>
      sort
        ? [...all].sort(
            (a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1)
          )
        : all,
    [sort]
  );
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      maxWidth: 240,
      text: (row) => row.name,
      render: (row) => row.name
    },
    {
      id: "environment",
      header: "Production",
      render: (row) => <EnvMark present={row.present} env="Production" />
    }
  ];
  return (
    <ExampleCell align="stretch" label="Selection, sorting and virtual scrolling">
      <ExampleStage height="data">
        <DataTable
          label="Example resource table"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          sort={sort}
          height={320}
          virtual
          onSortChange={setSort}
          footer={`${rows.length} resources. ${selected.length} selected.`}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
