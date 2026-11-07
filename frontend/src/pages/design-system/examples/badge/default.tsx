import { Badge } from "@app/components/v4/ui/badge";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="outline">
        <Badge tone="outline">Production</Badge>
      </ExampleCell>
      <ExampleCell label="soft">
        <Badge tone="soft" mono>
          v2.14.0
        </Badge>
      </ExampleCell>
      <ExampleCell label="solid">
        <Badge tone="solid">Inherited</Badge>
      </ExampleCell>
      <ExampleCell label="accent">
        <Badge tone="accent">New</Badge>
      </ExampleCell>
      <ExampleCell label="ok">
        <Badge tone="ok" dot>
          Connected
        </Badge>
      </ExampleCell>
      <ExampleCell label="warn">
        <Badge tone="warn" dot>
          Expires in 7 days
        </Badge>
      </ExampleCell>
      <ExampleCell label="bad">
        <Badge tone="bad" dot>
          Unavailable
        </Badge>
      </ExampleCell>
      <ExampleCell label="info">
        <Badge tone="info" dot>
          Syncing
        </Badge>
      </ExampleCell>
    </ExampleGrid>
  );
}
