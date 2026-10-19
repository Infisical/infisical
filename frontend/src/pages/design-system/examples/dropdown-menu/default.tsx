import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dropdown-menu";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [checked, setChecked] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [details, setDetails] = useState(false);
  const [archived, setArchived] = useState(false);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="default">
        <UI.DropdownMenu>
          <UI.DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Environment actions
            </Button>
          </UI.DropdownMenuTrigger>
          <UI.DropdownMenuContent>
            <UI.DropdownMenuLabel>Staging</UI.DropdownMenuLabel>
            <UI.DropdownMenuItem onSelect={() => setDetails(!details)}>
              Connection details
            </UI.DropdownMenuItem>
            <UI.DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
              Show archived
            </UI.DropdownMenuCheckboxItem>
            <UI.DropdownMenuCheckboxItem
              checked={metadata}
              onCheckedChange={setMetadata}
              closeOnSelect
            >
              Show metadata and close
            </UI.DropdownMenuCheckboxItem>
            <UI.DropdownMenuSeparator />
            <UI.DropdownMenuItem disabled>Delete protected environment</UI.DropdownMenuItem>
          </UI.DropdownMenuContent>
        </UI.DropdownMenu>
        {details && <p className="text-sm">Staging connection</p>}
      </ExampleCell>
      <ExampleCell label="destructive">
        <UI.DropdownMenu>
          <UI.DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Archive actions
            </Button>
          </UI.DropdownMenuTrigger>
          <UI.DropdownMenuContent>
            <UI.DropdownMenuLabel>Staging</UI.DropdownMenuLabel>
            <UI.DropdownMenuItem variant="destructive" onSelect={() => setArchived(true)}>
              Archive environment
            </UI.DropdownMenuItem>
          </UI.DropdownMenuContent>
        </UI.DropdownMenu>
        {archived && (
          <p role="status" className="sr-only text-sm">
            Environment archived
          </p>
        )}
      </ExampleCell>
    </ExampleGrid>
  );
}
