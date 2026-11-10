import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Blocked by permission">
        <UI.DropdownMenu>
          <UI.DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Secret actions
            </Button>
          </UI.DropdownMenuTrigger>
          <UI.DropdownMenuContent>
            <UI.DropdownMenuItem>
              <Icon name="copy" />
              Copy value
            </UI.DropdownMenuItem>
            <UI.DropdownMenuItem disabledReason="Versioning is off for this project">
              <Icon name="history" />
              Version history
            </UI.DropdownMenuItem>
            <UI.DropdownMenuItem asChild disabledReason="Exports are off on this plan">
              <a href="https://infisical.com/docs">
                <Icon name="download" />
                Export
              </a>
            </UI.DropdownMenuItem>
            <UI.DropdownMenuSeparator />
            <UI.DropdownMenuItem
              variant="destructive"
              disabledReason="You need permission to delete secrets"
            >
              <Icon name="trash" />
              Delete
            </UI.DropdownMenuItem>
          </UI.DropdownMenuContent>
        </UI.DropdownMenu>
      </ExampleCell>
    </ExampleGrid>
  );
}
