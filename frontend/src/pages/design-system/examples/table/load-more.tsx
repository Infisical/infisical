import { useEffect, useState } from "react";

import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";

import { ExampleCell, ExampleStage } from "../../example-presentation";

type Row = { id: string; name: string; time: string };
const total = 200;
const page = 40;
const makeRows = (from: number, count: number): Row[] =>
  Array.from({ length: Math.min(count, total - from) }, (_, offset) => {
    const minutes = 23 * 60 + 59 - (from + offset) * 7;
    return {
      id: `event-${from + offset}`,
      name: `example_event_${from + offset}`,
      time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    };
  });
const columns: DataTableColumn<Row>[] = [
  { id: "time", header: "Time", width: 120, render: (row) => row.time },
  { id: "name", header: "Event", primary: true, grow: true, render: (row) => row.name }
];

export default function Example() {
  const [rows, setRows] = useState(() => makeRows(0, page));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setTimeout(() => {
      setRows((current) => [...current, ...makeRows(current.length, page)]);
      setLoading(false);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return (
    <ExampleCell align="stretch" label="Floating load more, focus lands on the first new row">
      <ExampleStage height="data">
        <DataTable
          label="Example event log"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          height={320}
          rowHeight={48}
          virtual
          loadMore={
            rows.length < total
              ? { label: `Load ${page} more`, loading, onClick: () => setLoading(true) }
              : undefined
          }
          footer={`Showing ${rows.length} of ${total} events`}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
