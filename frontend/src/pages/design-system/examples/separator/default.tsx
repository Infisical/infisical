import { Separator } from "@app/components/v4/ui/separator";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="horizontal">
        <p>Connection settings</p>
        <Separator />
        <p>Access settings</p>
      </ExampleCell>
      <ExampleCell label="labelled">
        <Separator label="or" />
      </ExampleCell>
      <ExampleCell label="vertical">
        <div className="flex h-6 items-stretch gap-4">
          <span>Staging</span>
          <Separator orientation="vertical" />
          <span>Production</span>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
