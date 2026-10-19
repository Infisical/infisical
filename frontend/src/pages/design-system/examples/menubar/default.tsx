import { useState } from "react";

import * as UI from "@app/components/v4/ui/menubar";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [checked, setChecked] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [details, setDetails] = useState(false);
  const [archived, setArchived] = useState(false);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="default">
        <UI.Menubar>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>Environment</UI.MenubarTrigger>
            <UI.MenubarContent>
              <UI.MenubarLabel>Staging</UI.MenubarLabel>
              <UI.MenubarItem onSelect={() => setDetails(!details)}>
                Connection details
              </UI.MenubarItem>
              <UI.MenubarCheckboxItem checked={checked} onCheckedChange={setChecked}>
                Show archived
              </UI.MenubarCheckboxItem>
              <UI.MenubarCheckboxItem
                checked={metadata}
                onCheckedChange={setMetadata}
                closeOnSelect
              >
                Show metadata and close
              </UI.MenubarCheckboxItem>
              <UI.MenubarSeparator />
              <UI.MenubarItem disabled>Delete protected environment</UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>
        {details && <p className="text-sm">Staging connection</p>}
      </ExampleCell>
      <ExampleCell label="destructive">
        <UI.Menubar>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>Archive</UI.MenubarTrigger>
            <UI.MenubarContent>
              <UI.MenubarLabel>Staging</UI.MenubarLabel>
              <UI.MenubarItem variant="destructive" onSelect={() => setArchived(true)}>
                Archive environment
              </UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>
        {archived && (
          <p role="status" className="sr-only text-sm">
            Environment archived
          </p>
        )}
      </ExampleCell>
    </ExampleGrid>
  );
}
