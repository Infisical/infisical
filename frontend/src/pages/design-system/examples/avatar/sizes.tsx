import { Avatar } from "@app/components/v4/ui/avatar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["sm", "default", "lg"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <Avatar size={size} name="Ada Morgan" />
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
