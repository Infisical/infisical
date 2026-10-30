import { Kbd } from "@app/components/v4/ui/kbd";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="mac">
        <Kbd keys={["mod", "shift", "p"]} platform="mac" />
      </ExampleCell>
      <ExampleCell label="other">
        <Kbd keys={["mod", "shift", "p"]} platform="other" />
      </ExampleCell>
    </ExampleGrid>
  );
}
