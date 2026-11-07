import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Leading icon">
        <Button icon="plus">Add connection</Button>
      </ExampleCell>
      <ExampleCell label="Trailing icon">
        <Button variant="outline" iconRight="chev-right" asChild>
          <a href="#pagination">Continue</a>
        </Button>
      </ExampleCell>
      <ExampleCell label="Icon only">
        <Button variant="ghost" size="icon" icon="eye" iconOnly aria-label="Show preview" />
      </ExampleCell>
    </ExampleGrid>
  );
}
