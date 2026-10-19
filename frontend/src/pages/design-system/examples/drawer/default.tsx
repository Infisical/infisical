import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/drawer";

import { ExampleStack } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleStack>
      <UI.Drawer autoFocus>
        <UI.DrawerTrigger asChild>
          <Button variant="outline">View request</Button>
        </UI.DrawerTrigger>
        <UI.DrawerContent>
          <UI.DrawerHeader>
            <UI.DrawerTitle>Access request</UI.DrawerTitle>
            <UI.DrawerDescription>Read access requested for 1 hour.</UI.DrawerDescription>
          </UI.DrawerHeader>
          <UI.DrawerFooter>
            <UI.DrawerClose asChild>
              <Button>Close request</Button>
            </UI.DrawerClose>
          </UI.DrawerFooter>
        </UI.DrawerContent>
      </UI.Drawer>
    </ExampleStack>
  );
}
