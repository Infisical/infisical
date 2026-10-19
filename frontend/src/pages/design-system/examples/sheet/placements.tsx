import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sheet";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <ExampleCell key={side} label={side}>
          <UI.Sheet>
            <UI.SheetTrigger asChild>
              <Button variant="outline">{side} sheet</Button>
            </UI.SheetTrigger>
            <UI.SheetContent side={side}>
              <UI.SheetHeader>
                <UI.SheetTitle>Staging connection</UI.SheetTitle>
                <UI.SheetDescription>
                  Read access, last synchronized 12 versions.
                </UI.SheetDescription>
              </UI.SheetHeader>
              <UI.SheetFooter>
                <UI.SheetClose asChild>
                  <Button variant="outline">Close connection</Button>
                </UI.SheetClose>
              </UI.SheetFooter>
            </UI.SheetContent>
          </UI.Sheet>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
