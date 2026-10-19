import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { CopyButton } from "@app/components/v4/ui/sensitive-editor";

import { ExampleCell } from "../../example-presentation";

const path = "project/production/services/payment-processing-api";
export default function Example() {
  return (
    <ExampleCell label="Resource path">
      <div className="flex w-full items-center gap-2">
        <div className="w-64 max-w-full min-w-0">
          <MiddleTruncate mono keepEnd={12}>
            {path}
          </MiddleTruncate>
        </div>
        <CopyButton iconOnly value={path} label="Copy full path" />
      </div>
    </ExampleCell>
  );
}
