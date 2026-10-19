import { Archive } from "lucide-react";

import * as UI from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {(["default", "sm"] as const).map((size) => (
        <ExampleCell key={size} label={size}>
          <UI.AlertDialog>
            <UI.AlertDialogTrigger asChild>
              <Button variant="outline">
                {size === "sm" ? "Small confirmation" : "Default confirmation"}
              </Button>
            </UI.AlertDialogTrigger>
            <UI.AlertDialogContent size={size}>
              <UI.AlertDialogHeader>
                <UI.AlertDialogMedia>
                  <Archive aria-hidden="true" />
                </UI.AlertDialogMedia>
                <UI.AlertDialogTitle>Archive request details?</UI.AlertDialogTitle>
                <UI.AlertDialogDescription>
                  Archived requests remain available in the audit log. Cancel to keep this request
                  open.
                </UI.AlertDialogDescription>
              </UI.AlertDialogHeader>
              <UI.AlertDialogFooter>
                <UI.AlertDialogCancel>Keep request</UI.AlertDialogCancel>
                <UI.AlertDialogAction disabled>Archive unavailable</UI.AlertDialogAction>
              </UI.AlertDialogFooter>
            </UI.AlertDialogContent>
          </UI.AlertDialog>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
