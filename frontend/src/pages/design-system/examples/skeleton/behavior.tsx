import { Skeleton } from "@app/components/v4/ui/skeleton";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="One line">
        <Skeleton lines={1} />
      </ExampleCell>
      <ExampleCell label="Three lines">
        <Skeleton lines={3} />
      </ExampleCell>
      <ExampleCell label="Longer block">
        <Skeleton lines={5} />
      </ExampleCell>
    </ExampleGrid>
  );
}
