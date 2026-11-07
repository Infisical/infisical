import { useState } from "react";

import * as UI from "@app/components/v4/ui/context-menu";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  const [archived, setArchived] = useState(false);
  const [metadata, setMetadata] = useState(true);
  const [details, setDetails] = useState(false);
  const [done, setDone] = useState(false);
  const status = [done && "Environment archived", details && "Staging connection"]
    .filter(Boolean)
    .join(". ");
  return (
    <ExampleStack>
      <UI.ContextMenu>
        <UI.ContextMenuTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground flex min-h-32 w-full items-center justify-center rounded-sm border border-dashed border-border p-4"
          >
            Right-click this area
          </button>
        </UI.ContextMenuTrigger>
        <UI.ContextMenuContent>
          <UI.ContextMenuLabel>Staging</UI.ContextMenuLabel>
          <UI.ContextMenuItem onSelect={() => setDetails(!details)}>
            Connection details
          </UI.ContextMenuItem>
          <UI.ContextMenuCheckboxItem checked={archived} onCheckedChange={setArchived}>
            Show archived
          </UI.ContextMenuCheckboxItem>
          <UI.ContextMenuCheckboxItem
            checked={metadata}
            onCheckedChange={setMetadata}
            closeOnSelect
          >
            Show metadata and close
          </UI.ContextMenuCheckboxItem>
          <UI.ContextMenuSeparator />
          <UI.ContextMenuItem variant="destructive" onSelect={() => setDone(true)}>
            Archive environment
          </UI.ContextMenuItem>
        </UI.ContextMenuContent>
      </UI.ContextMenu>
      <p role="status" className="sr-only text-sm">
        {status}
      </p>
    </ExampleStack>
  );
}
