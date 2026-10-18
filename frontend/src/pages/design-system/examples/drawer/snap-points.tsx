import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/drawer";

export default function Example() {
  const [snap, setSnap] = useState<number | string | null>(1);
  return (
    <UI.Drawer snapPoints={[0.5, 1]} activeSnapPoint={snap} setActiveSnapPoint={setSnap} autoFocus>
      <UI.DrawerTrigger asChild>
        <Button variant="outline">Adjust review height</Button>
      </UI.DrawerTrigger>
      <UI.DrawerContent style={{ height: "100dvh", maxHeight: "100dvh" }}>
        <UI.DrawerHeader>
          <UI.DrawerTitle>Connection review height</UI.DrawerTitle>
          <UI.DrawerDescription>
            Choose a bounded review height for this local connection.
          </UI.DrawerDescription>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" aria-pressed={snap === 0.5} onClick={() => setSnap(0.5)}>
              Half height
            </Button>
            <Button variant="outline" aria-pressed={snap === 1} onClick={() => setSnap(1)}>
              Full height
            </Button>
            <UI.DrawerClose asChild>
              <Button variant="outline">Close review</Button>
            </UI.DrawerClose>
          </div>
        </UI.DrawerHeader>
      </UI.DrawerContent>
    </UI.Drawer>
  );
}
