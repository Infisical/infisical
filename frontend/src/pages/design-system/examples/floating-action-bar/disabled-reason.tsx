import { useState } from "react";

import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleStage } from "../../example-presentation";

const secrets = [
  { key: "stripe_api_key", environment: "production" },
  { key: "database_url", environment: "staging" },
  { key: "sentry_dsn", environment: "production" }
];

export default function Example() {
  const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
  const [message, setMessage] = useState("");
  const environments = new Set(
    secrets.filter((secret) => selected.includes(secret.key)).map((secret) => secret.environment)
  );
  const reason = environments.size > 1 ? "Select secrets from one environment to copy" : undefined;
  return (
    <ExampleCell label="Copy blocked until the selection shares one environment" align="stretch">
      <ExampleStage height="app">
        <List
          label="Secrets"
          title="Secrets"
          selection="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
          footer={message || undefined}
        >
          {secrets.map((secret) => (
            <ListRow
              key={secret.key}
              value={secret.key}
              label={secret.key}
              title={<code>{secret.key}</code>}
              meta={secret.environment}
            />
          ))}
        </List>
        <FloatingActionBar
          count={selected.length}
          onClear={() => setSelected([])}
          actions={[
            {
              label: "Copy to new source",
              icon: "copy",
              disabledReason: reason,
              onClick: () => setMessage(`Ready to copy ${selected.length} secrets.`)
            },
            {
              label: "Delete",
              icon: "trash",
              danger: true,
              onClick: () => setMessage(`Ready to delete ${selected.length} secrets.`)
            }
          ]}
          moreActions={[
            {
              label: "Export as .env",
              disabledReason: reason && "Select secrets from one environment to export",
              onClick: () => setMessage(`Ready to export ${selected.length} secrets.`)
            }
          ]}
        />
      </ExampleStage>
    </ExampleCell>
  );
}
