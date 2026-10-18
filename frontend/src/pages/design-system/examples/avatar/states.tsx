import { Avatar } from "@app/components/v4/ui/avatar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["ok", "warn", "off"] as const).map((status) => (
        <ExampleCell key={status} label={status}>
          <Avatar name={`Ada Morgan, ${status}`} status={status} initials="AM" />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
