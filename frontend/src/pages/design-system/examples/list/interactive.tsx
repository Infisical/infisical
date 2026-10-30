import * as React from "react";

import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const environments = [
  { id: "development", title: "Development", description: "14 secrets, synced 2 minutes ago" },
  { id: "staging", title: "Staging", description: "12 secrets, synced 1 hour ago" },
  { id: "production", title: "Production", description: "12 secrets, approval required" }
];
export default function Interactive() {
  const [current, setCurrent] = React.useState("staging");
  const [opened, setOpened] = React.useState("None");
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="Link rows, hover a row, staging is current">
        <List label="Environments" title="Environments">
          {environments.map((row) => (
            <ListRow
              key={row.id}
              value={row.id}
              label={row.title}
              title={row.title}
              description={row.description}
              href={`#list-${row.id}`}
              current={current === row.id}
              onClick={(event) => {
                event.preventDefault();
                setCurrent(row.id);
              }}
            />
          ))}
        </List>
      </ExampleCell>
      <ExampleCell align="stretch" label={`Button rows, hover or press a row. Opened: ${opened}`}>
        <List label="Recent requests" title="Recent requests">
          <ListRow
            value="rotate"
            label="Rotate database credentials"
            title="Rotate database credentials"
            meta="2m"
            onClick={() => setOpened("Rotate database credentials")}
          />
          <ListRow
            value="access"
            label="Grant staging access"
            title="Grant staging access"
            meta="1h"
            onClick={() => setOpened("Grant staging access")}
          />
          <ListRow
            value="expired"
            label="Expired request"
            title="Expired request"
            meta="3d"
            disabled
            onClick={() => setOpened("Expired request")}
          />
        </List>
      </ExampleCell>
    </ExampleGrid>
  );
}
