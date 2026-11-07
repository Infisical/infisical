import { useState } from "react";

import { Icon } from "@app/components/v4/ui/icon";
import { Toggle } from "@app/components/v4/ui/toggle";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [metadata, setMetadata] = useState(true);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Text, off">
        <Toggle>Metadata</Toggle>
      </ExampleCell>
      <ExampleCell label="Text, on">
        <Toggle pressed={metadata} onPressedChange={setMetadata}>
          Metadata
        </Toggle>
      </ExampleCell>
      <ExampleCell label="Icon, off">
        <Toggle aria-label="Show values">
          <Icon name="eye" />
        </Toggle>
      </ExampleCell>
      <ExampleCell label="Icon, on">
        <Toggle aria-label="Show values" defaultPressed>
          <Icon name="eye" />
        </Toggle>
      </ExampleCell>
    </ExampleGrid>
  );
}
