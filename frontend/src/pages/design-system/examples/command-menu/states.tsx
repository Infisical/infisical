import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { CommandMenu } from "@app/components/v4/ui/command-menu";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState<"loading" | "empty" | null>(null);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  return (
    <ExampleGrid width="wide">
      <ExampleCell label="Loading results">
        <Button variant="outline" onClick={() => setOpen("loading")}>
          Open palette
        </Button>
        <CommandMenu
          hotkey={false}
          filter={false}
          loading
          label="Loading connections"
          groups={[]}
          open={open === "loading"}
          onOpenChange={close}
        />
      </ExampleCell>
      <ExampleCell label="No results">
        <Button variant="outline" onClick={() => setOpen("empty")}>
          Open palette
        </Button>
        <CommandMenu
          hotkey={false}
          filter={false}
          label="Search connections"
          groups={[]}
          emptyHint="Enter a connection name."
          open={open === "empty"}
          onOpenChange={close}
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
