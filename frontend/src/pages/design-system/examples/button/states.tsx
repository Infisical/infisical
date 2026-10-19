import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Idle">
        <Button loading={false}>Save changes</Button>
      </ExampleCell>
      <ExampleCell label="Loading">
        <Button loading>Save changes</Button>
      </ExampleCell>
      <ExampleCell label="Loading with icon">
        <Button variant="outline" icon="plus" loading>
          Add connection
        </Button>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Button disabled>Save changes</Button>
      </ExampleCell>
    </ExampleGrid>
  );
}
