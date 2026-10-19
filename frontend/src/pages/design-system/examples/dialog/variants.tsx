import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dialog";

import { ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {[true, false].map((showCloseButton) => (
        <UI.Dialog key={String(showCloseButton)}>
          <UI.DialogTrigger asChild>
            <Button variant="outline">{showCloseButton ? "Corner close" : "Footer close"}</Button>
          </UI.DialogTrigger>
          <UI.DialogContent showCloseButton={showCloseButton}>
            <UI.DialogHeader>
              <UI.DialogTitle>Environment details</UI.DialogTitle>
              <UI.DialogDescription>Read-only details for Staging.</UI.DialogDescription>
            </UI.DialogHeader>
            <p>Region: eu-west-1. Access: Platform team.</p>
            <UI.DialogFooter showCloseButton={!showCloseButton}>
              {showCloseButton && (
                <UI.DialogClose asChild>
                  <Button variant="outline">Done reviewing</Button>
                </UI.DialogClose>
              )}
            </UI.DialogFooter>
          </UI.DialogContent>
        </UI.Dialog>
      ))}
    </ExampleGrid>
  );
}
