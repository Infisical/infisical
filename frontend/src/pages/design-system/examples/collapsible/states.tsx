import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@app/components/v4/ui/collapsible";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState(true);
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Controlled, retained draft">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline">Connection note</Button>
          </CollapsibleTrigger>
          <CollapsibleContent forceMount hidden={!open}>
            <div className="pt-3">
              <Input aria-label="Connection note" defaultValue="Keep for 30 days" />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ExampleCell>
      <ExampleCell label="Disabled">
        <Collapsible disabled>
          <CollapsibleTrigger asChild>
            <Button variant="outline">Managed by policy</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>Managed by administrators.</CollapsibleContent>
        </Collapsible>
      </ExampleCell>
    </ExampleGrid>
  );
}
