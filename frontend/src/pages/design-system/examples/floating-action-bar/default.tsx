import { useState } from "react";

import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleStage } from "../../example-presentation";

const secrets = ["stripe_api_key", "database_url", "sentry_dsn", "redis_password", "jwt_secret"];

export default function Example() {
  const [rows, setRows] = useState(secrets);
  const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
  const [message, setMessage] = useState("");
  return (
    <ExampleCell label="contained, two of five selected" align="stretch">
      <ExampleStage height="app">
        <List
          label="Secrets"
          title="Secrets"
          selection="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
          footer={message || undefined}
        >
          {rows.map((key) => (
            <ListRow key={key} value={key} label={key} title={<code>{key}</code>} />
          ))}
        </List>
        <FloatingActionBar
          placement="contained"
          count={selected.length}
          total={412}
          onSelectAll={() => setSelected(rows)}
          onClear={() => setSelected([])}
          actions={[
            {
              label: "Move",
              icon: "folder",
              onClick: () => setMessage(`Ready to move ${selected.length}.`)
            },
            {
              label: "Delete",
              icon: "trash",
              danger: true,
              onClick: () => {
                setRows(rows.filter((row) => !selected.includes(row)));
                setMessage(`Deleted ${selected.length} secrets.`);
                setSelected([]);
              }
            }
          ]}
          moreActions={[{ label: "Export as .env", onClick: () => setMessage("Export started.") }]}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
