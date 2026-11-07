import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sheet";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.Sheet>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Inspect connection</Button>
        </UI.SheetTrigger>
        <UI.SheetContent>
          <UI.SheetHeader>
            <UI.SheetTitle>Staging connection</UI.SheetTitle>
            <UI.SheetDescription>
              View the destination and synchronization status.
            </UI.SheetDescription>
          </UI.SheetHeader>
          <UI.SheetBody>
            <p>All 12 versions synchronized.</p>
          </UI.SheetBody>
          <UI.SheetFooter>
            <UI.SheetClose asChild>
              <Button>Close connection</Button>
            </UI.SheetClose>
          </UI.SheetFooter>
        </UI.SheetContent>
      </UI.Sheet>
    </ExampleStack>
  );
}
