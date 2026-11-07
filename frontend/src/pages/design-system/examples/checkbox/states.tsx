import { Checkbox } from "@app/components/v4/ui/checkbox";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Off">
        <Checkbox label="Deployments" />
      </ExampleCell>
      <ExampleCell label="On">
        <Checkbox label="Deployments" defaultChecked />
      </ExampleCell>
      <ExampleCell label="Mixed">
        <Checkbox label="All environments" indeterminate />
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Checkbox label="Audit events" disabled defaultChecked />
      </ExampleCell>
    </ExampleGrid>
  );
}
