import { Switch } from "@app/components/v4/ui/switch";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["sm", "default"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Switch size={size} label="Audit events" defaultChecked />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
