import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { CopyButton } from "@app/components/v4/ui/sensitive-editor";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const path = "applications/staging/services/payment-processing/configuration/retention-policy";
export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Fits fully">
        <MiddleTruncate text="project_staging" />
      </ExampleCell>
      <ExampleCell label="Default end, plain text">
        <div className="flex w-full items-center gap-2">
          <div className="w-48 max-w-full min-w-0">
            <MiddleTruncate text={path} mono={false} />
          </div>
          <CopyButton iconOnly value={path} label="Copy full resource path" />
        </div>
      </ExampleCell>
      <ExampleCell label="Narrow, end 16">
        <div className="w-16 max-w-full">
          <MiddleTruncate keepEnd={16} mono>
            {path}
          </MiddleTruncate>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
