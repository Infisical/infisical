import { Button } from "@app/components/v4/ui/button";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  return (
    <TooltipProvider>
      <ExampleGrid width="compact">
        {placements.map(({ side, align }) => (
          <ExampleCell key={side} label={side}>
            <Tooltip side={side} align={align} wrap content="Connection status">
              <Button variant="outline">align {align}</Button>
            </Tooltip>
          </ExampleCell>
        ))}
      </ExampleGrid>
    </TooltipProvider>
  );
}
