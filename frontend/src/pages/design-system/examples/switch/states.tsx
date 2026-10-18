import { Switch } from "@app/components/v4/ui/switch";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Off">
        <Switch aria-label="Audit events, off" />
      </ExampleCell>
      <ExampleCell label="On">
        <Switch aria-label="Audit events, on" defaultChecked />
      </ExampleCell>
      <ExampleCell label="Disabled, off">
        <Switch aria-label="Audit events, disabled off" disabled />
      </ExampleCell>
      <ExampleCell label="Disabled, on">
        <Switch aria-label="Audit events, disabled on" disabled defaultChecked />
      </ExampleCell>
    </ExampleGrid>
  );
}
