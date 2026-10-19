import { Badge } from "@app/components/v4/ui/badge";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["sm", "md"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Badge size={size} tone="ok" dot>
            Connected
          </Badge>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
