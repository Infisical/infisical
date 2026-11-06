import { Button } from "@app/components/v4/ui/button";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const reason = "Only project admins can export secrets.";

export default function Example() {
  return (
    <TooltipProvider>
      <ExampleGrid width="compact">
        <ExampleCell label="Blocked: hover or Tab shows why">
          <Button variant="outline" icon="download" disabledReason={reason}>
            Export
          </Button>
        </ExampleCell>
        <ExampleCell label="Enabled: the label tooltip">
          <Tooltip content="Export secrets">
            <Button variant="outline" icon="download">
              Export
            </Button>
          </Tooltip>
        </ExampleCell>
        <ExampleCell label="Pending: loading, no tooltip">
          <Button variant="outline" icon="download" loading>
            Export
          </Button>
        </ExampleCell>
      </ExampleGrid>
    </TooltipProvider>
  );
}
