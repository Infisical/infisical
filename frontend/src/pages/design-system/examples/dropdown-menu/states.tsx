import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dropdown-menu";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const stateLabel = (checked: boolean | "indeterminate") => {
  if (checked === "indeterminate") return "Mixed";
  return checked ? "Checked" : "Unchecked";
};
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleGrid width="compact">
      {([false, true, "indeterminate"] as const).map((checked) => (
        <ExampleCell key={String(checked)} label={stateLabel(checked)}>
          <UI.DropdownMenu>
            <UI.DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Open menu
              </Button>
            </UI.DropdownMenuTrigger>
            <UI.DropdownMenuContent>
              <UI.DropdownMenuCheckboxItem checked={checked} disabled>
                Include deployment-client metadata and inherited environment permissions
              </UI.DropdownMenuCheckboxItem>
              <UI.DropdownMenuItem onSelect={() => setSelected(true)}>
                Connection details
              </UI.DropdownMenuItem>
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
