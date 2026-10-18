import { Skeleton } from "@app/components/v4/ui/skeleton";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid>
      <ExampleCell label="Text lines" align="stretch">
        <Skeleton lines={3} />
      </ExampleCell>
      <ExampleCell label="Avatar and text" align="stretch">
        <div className="flex w-full items-start gap-3">
          <Skeleton width={32} height={32} />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton width="45%" height={14} />
            <Skeleton lines={2} height={12} />
          </div>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
