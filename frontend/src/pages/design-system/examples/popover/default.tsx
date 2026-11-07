import { Button } from "@app/components/v4/ui/button";
import { Input } from "@app/components/v4/ui/input";
import { Label } from "@app/components/v4/ui/label";
import * as UI from "@app/components/v4/ui/popover";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.Popover>
        <UI.PopoverTrigger asChild>
          <Button variant="outline">Connection settings</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent>
          <UI.PopoverHeader>
            <UI.PopoverTitle>Connection settings</UI.PopoverTitle>
            <UI.PopoverDescription>Choose the destination hostname.</UI.PopoverDescription>
          </UI.PopoverHeader>
          <Label htmlFor="popover-host">Hostname</Label>
          <Input id="popover-host" defaultValue="vault.example.test" />
        </UI.PopoverContent>
      </UI.Popover>
    </ExampleStack>
  );
}
