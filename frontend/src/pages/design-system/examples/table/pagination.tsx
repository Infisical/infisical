import * as React from "react";

import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { Pagination } from "@app/components/v4/ui/pagination";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

type Event = { id: string; actor: string; action: string; at: string };
const actors = ["ci-deployer", "sarah@acme.dev", "rotation-worker", "k8s-operator"];
const actions = ["secret.read", "secret.update", "identity.login", "key.rotate"];
const events: Event[] = Array.from({ length: 132 }, (_, index) => ({
  id: `event-${index + 1}`,
  actor: actors[index % actors.length],
  action: actions[(index * 3) % actions.length],
  at: `2026-10-${String(28 - (index % 28)).padStart(2, "0")}`
}));
const columns: DataTableColumn<Event>[] = [
  { id: "actor", header: "Actor", primary: true, grow: true, render: (row) => row.actor },
  { id: "action", header: "Action", width: 160, render: (row) => row.action },
  { id: "at", header: "Date", width: 120, render: (row) => row.at }
];

export default function PaginationSlot() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const rows = events.slice((page - 1) * pageSize, page * pageSize);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Rows per page, range and previous and next">
        <DataTable
          label="Audit events"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => `${row.actor} ${row.action}`}
          pagination={
            <Pagination
              label="Audit event pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={events.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={setPageSize}
            />
          }
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
