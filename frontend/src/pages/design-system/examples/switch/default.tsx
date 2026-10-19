import { useState } from "react";

import { Switch } from "@app/components/v4/ui/switch";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [events, setEvents] = useState(true);
  const [rotation, setRotation] = useState(false);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Inline">
        <Switch label="Audit events" checked={events} onChange={setEvents} />
      </ExampleCell>
      <ExampleCell align="stretch" label="Row with description">
        <Switch
          label="Automatic rotation"
          description="Rotate credentials every 30 days."
          layout="row"
          checked={rotation}
          onChange={setRotation}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
