import * as React from "react";

import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Row = { id: string; key: string; updated: string };
const all: Row[] = [
  { id: "stripe", key: "STRIPE_API_KEY", updated: "2 days ago" },
  { id: "database", key: "DATABASE_URL", updated: "5 hours ago" },
  { id: "sendgrid", key: "SENDGRID_TOKEN", updated: "3 weeks ago" }
];
type Sort = { columnId: string; direction: "asc" | "desc" };
const columns: DataTableColumn<Row>[] = [
  {
    id: "key",
    header: "Key",
    primary: true,
    sortable: true,
    text: (row) => row.key,
    render: (row) => row.key
  },
  { id: "updated", header: "Updated", render: (row) => row.updated }
];
function SortedTable({ label, initial }: { label: string; initial?: Sort }) {
  const [sort, setSort] = React.useState<Sort | undefined>(initial);
  const rows = sort
    ? [...all].sort((a, b) => a.key.localeCompare(b.key) * (sort.direction === "asc" ? 1 : -1))
    : all;
  return (
    <DataTable
      label={label}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.key}
      sort={sort}
      onSortChange={setSort}
    />
  );
}
export default function Sorting() {
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Unsorted">
        <SortedTable label="Unsorted secrets" />
      </ExampleCell>
      <ExampleCell align="stretch" label="Ascending">
        <SortedTable label="Ascending secrets" initial={{ columnId: "key", direction: "asc" }} />
      </ExampleCell>
      <ExampleCell align="stretch" label="Descending">
        <SortedTable label="Descending secrets" initial={{ columnId: "key", direction: "desc" }} />
      </ExampleCell>
    </ExampleGrid>
  );
}
