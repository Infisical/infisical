import { useState } from "react";

import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { List, ListRow } from "@app/components/v4/ui/list";
import { toast } from "@app/components/v4/ui/sonner";

import { ExampleCell, ExampleStage } from "../../example-presentation";

const secrets = ["stripe_api_key", "database_url", "sentry_dsn", "redis_password", "jwt_secret"];

export default function Example() {
  const [rows, setRows] = useState(secrets);
  const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
  return (
    <ExampleCell label="Two of five selected" align="stretch">
      <ExampleStage height="app">
        <List
          label="Secrets"
          title="Secrets"
          selection="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
        >
          {rows.map((key) => (
            <ListRow key={key} value={key} label={key} title={<code>{key}</code>} />
          ))}
        </List>
        <FloatingActionBar
          count={selected.length}
          total={rows.length}
          onSelectAll={() => setSelected(rows)}
          onClear={() => setSelected([])}
          actions={[
            {
              label: "Move",
              icon: "folder",
              onClick: () => toast(`Ready to move ${selected.length}.`)
            },
            {
              label: "Delete",
              icon: "trash",
              danger: true,
              onClick: () => {
                setRows(rows.filter((row) => !selected.includes(row)));
                toast(`Deleted ${selected.length} secrets.`);
                setSelected([]);
              }
            }
          ]}
          moreActions={[
            {
              label: "Download names",
              onClick: () => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(
                  new Blob([`${selected.join("\n")}\n`], { type: "text/plain" })
                );
                link.download = "secret-names.txt";
                link.click();
                URL.revokeObjectURL(link.href);
                toast(`Downloaded ${selected.length} names.`);
              }
            }
          ]}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
