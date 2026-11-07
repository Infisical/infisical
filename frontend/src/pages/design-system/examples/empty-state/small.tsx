import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { EmptyState } from "@app/components/v4/ui/empty";
import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell } from "../../example-presentation";

const secrets = ["DATABASE_URL", "REDIS_URL", "SESSION_KEY"];

export default function Example() {
  const [query, setQuery] = useState("stripe_web");
  const rows = secrets.filter((name) => name.toLowerCase().includes(query));
  return (
    <ExampleCell align="stretch" label="sm">
      <List
        label="Staging secrets"
        title="Staging secrets"
        empty={
          <EmptyState
            size="sm"
            icon="search"
            title={`No secrets match “${query}”`}
            actions={
              <Button variant="link" onClick={() => setQuery("")}>
                Clear filter
              </Button>
            }
          />
        }
      >
        {rows.map((name) => (
          <ListRow key={name} value={name} label={name} title={name} />
        ))}
      </List>
    </ExampleCell>
  );
}
