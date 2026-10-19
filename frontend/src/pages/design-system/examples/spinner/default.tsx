import { Spinner } from "@app/components/v4/ui/spinner";

import { ExampleCell, ExampleGrid, ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <ExampleGrid width="compact">
        <ExampleCell label="inline">
          <Spinner />
        </ExampleCell>
        <ExampleCell label="base">
          <Spinner size="base" label="Loading connections" />
        </ExampleCell>
      </ExampleGrid>
      <ExampleGrid width="compact">
        <ExampleCell label="page">
          <div className="-mt-5 -mb-10">
            <Spinner
              size="page"
              className="w-fit"
              label="Loading connections"
              description="Fetching provider configuration"
            />
          </div>
        </ExampleCell>
      </ExampleGrid>
    </ExampleStack>
  );
}
