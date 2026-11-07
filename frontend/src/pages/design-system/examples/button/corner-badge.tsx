import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="outline with a Last used Badge">
        <Button
          variant="outline"
          size="md"
          cornerBadge={
            <Badge tone="accent" size="sm">
              Last used
            </Badge>
          }
        >
          Continue with Google
        </Button>
      </ExampleCell>
    </ExampleGrid>
  );
}
