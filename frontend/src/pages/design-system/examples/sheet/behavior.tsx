import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/sheet";

export default function Example() {
  const [open, setOpen] = useState(false);
  return (
    <UI.Sheet open={open} onOpenChange={setOpen}>
      <UI.SheetTrigger asChild>
        <Button variant="outline">Review grants</Button>
      </UI.SheetTrigger>
      <UI.SheetContent showCloseButton={false}>
        <UI.SheetHeader>
          <UI.SheetTitle>Connection grants</UI.SheetTitle>
          <UI.SheetDescription>
            24 fictional grants. Use the footer action or Escape to close.
          </UI.SheetDescription>
        </UI.SheetHeader>
        <UI.SheetBody>
          <ul>
            {Array.from({ length: 24 }, (_, index) => (
              <li key={index}>Client {index + 1}: read Staging configuration</li>
            ))}
          </ul>
        </UI.SheetBody>
        <UI.SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done reviewing
          </Button>
        </UI.SheetFooter>
      </UI.SheetContent>
    </UI.Sheet>
  );
}
