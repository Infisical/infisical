import { useState } from "react";

import { List, ListRow } from "@app/components/v4/ui/list";

import { ExampleCell } from "../example-presentation";

export default function Example() {
  const [current, setCurrent] = useState("staging");
  return (
    <ExampleCell align="stretch" label="Current and unavailable rows">
      <List label="Connections">
        {["staging", "production", "preview"].map((name) => (
          <ListRow
            key={name}
            value={name}
            title={name}
            label={name}
            current={current === name}
            disabled={name === "preview"}
            onClick={() => setCurrent(name)}
          />
        ))}
      </List>
    </ExampleCell>
  );
}
