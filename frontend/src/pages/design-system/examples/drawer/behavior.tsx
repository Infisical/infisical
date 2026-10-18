import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/drawer";

export default function Example() {
  const [open, setOpen] = useState(false);
  return (
    <UI.Drawer open={open} onOpenChange={setOpen} dismissible={false} autoFocus>
      <UI.DrawerTrigger asChild>
        <Button variant="outline">Review grants</Button>
      </UI.DrawerTrigger>
      <UI.DrawerContent className="h-full">
        <UI.DrawerHeader>
          <UI.DrawerTitle>Connection grants</UI.DrawerTitle>
          <UI.DrawerDescription>
            24 fictional grants. Use Done reviewing to dismiss this review.
          </UI.DrawerDescription>
        </UI.DrawerHeader>
        <UI.DrawerBody>
          <ul>
            {Array.from({ length: 24 }, (_, index) => (
              <li key={index}>Client {index + 1}: read Staging configuration</li>
            ))}
          </ul>
        </UI.DrawerBody>
        <UI.DrawerFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done reviewing
          </Button>
        </UI.DrawerFooter>
      </UI.DrawerContent>
    </UI.Drawer>
  );
}
