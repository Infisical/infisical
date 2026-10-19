import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dropdown-menu";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleGrid width="compact">
      {placements.map(({ side, align }) => (
        <ExampleCell key={side} label={`${side} / ${align}`}>
          <UI.DropdownMenu>
            <UI.DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Open menu
              </Button>
            </UI.DropdownMenuTrigger>
            <UI.DropdownMenuContent side={side} align={align}>
              <UI.DropdownMenuItem onSelect={() => setSelected(true)}>
                Connection details
              </UI.DropdownMenuItem>
              <UI.DropdownMenuItem disabled>Delete locked environment</UI.DropdownMenuItem>
            </UI.DropdownMenuContent>
          </UI.DropdownMenu>
        </ExampleCell>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>
      )}
    </ExampleGrid>
  );
}
