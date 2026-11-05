import { StatusText } from "@app/components/v4/ui/text";
import { TooltipProvider, TooltipText } from "@app/components/v4/ui/tooltip";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <TooltipProvider>
      <ExampleGrid>
        <ExampleCell label="Plain text">
          <p className="text-sm">
            Last rotated <TooltipText content="2026-10-29 14:02 UTC">7 days ago</TooltipText>
          </p>
        </ExampleCell>
        <ExampleCell label="StatusText through asChild">
          <TooltipText
            asChild
            content="Auto-scan is disabled. Pushes to this repository do not trigger a scan."
          >
            <StatusText icon="clock">Paused</StatusText>
          </TooltipText>
        </ExampleCell>
      </ExampleGrid>
    </TooltipProvider>
  );
}
