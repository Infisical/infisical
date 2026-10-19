import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/drawer";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <UI.Drawer key={side} direction={side} autoFocus>
          <UI.DrawerTrigger asChild>
            <Button variant="outline">{side} drawer</Button>
          </UI.DrawerTrigger>
          <UI.DrawerContent>
            <UI.DrawerHeader>
              <UI.DrawerTitle>Staging connection</UI.DrawerTitle>
              <UI.DrawerDescription>24 fictional clients with read access.</UI.DrawerDescription>
            </UI.DrawerHeader>
            <UI.DrawerBody>
              <ul>
                {Array.from({ length: 24 }, (_, index) => (
                  <li key={index}>Client {index + 1}: read Staging configuration</li>
                ))}
              </ul>
            </UI.DrawerBody>
            <UI.DrawerFooter>
              <UI.DrawerClose asChild>
                <Button variant="outline">Close connection</Button>
              </UI.DrawerClose>
            </UI.DrawerFooter>
          </UI.DrawerContent>
        </UI.Drawer>
      ))}
    </ExampleGrid>
  );
}
