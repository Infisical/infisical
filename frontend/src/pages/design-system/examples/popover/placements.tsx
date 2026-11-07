import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/popover";

import { ExampleGrid } from "../../example-presentation";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  return (
    <ExampleGrid width="compact">
      {placements.map(({ side, align }) => (
        <UI.Popover key={side}>
          <UI.PopoverTrigger asChild>
            <Button variant="outline">
              {side} / {align}
            </Button>
          </UI.PopoverTrigger>
          <UI.PopoverContent
            side={side}
            align={align}
            style={{ minWidth: 0, maxWidth: "var(--radix-popover-content-available-width)" }}
            aria-label="Staging connection preview"
          >
            <p>Staging connection</p>
            <p>12 versions synchronized. Read access belongs to the Platform team.</p>
          </UI.PopoverContent>
        </UI.Popover>
      ))}
    </ExampleGrid>
  );
}
