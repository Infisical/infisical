import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="default, sm">
        <Button variant="outline">Save changes</Button>
      </ExampleCell>
      <ExampleCell label="md">
        <Button size="md" variant="outline">
          Save changes
        </Button>
      </ExampleCell>
      <ExampleCell label="lg">
        <Button size="lg" variant="outline">
          Save changes
        </Button>
      </ExampleCell>
      <ExampleCell label="icon">
        <Button size="icon" variant="outline" icon="settings" iconOnly aria-label="Settings" />
      </ExampleCell>
      <ExampleCell label="icon-lg">
        <Button size="icon-lg" variant="outline" icon="settings" iconOnly aria-label="Settings" />
      </ExampleCell>
    </ExampleGrid>
  );
}
