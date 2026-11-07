import { useState } from "react";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import * as UI from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ExampleGrid width="compact">
      {(["Confirmation", "Pending", "Error"] as const).map((state) => (
        <ExampleCell key={state} label={state}>
          <UI.AlertDialog
            open={open === state}
            onOpenChange={(next) => setOpen(next ? state : null)}
          >
            <UI.AlertDialogTrigger asChild>
              <Button variant="outline">Revoke access</Button>
            </UI.AlertDialogTrigger>
            <UI.AlertDialogContent tone="danger">
              <UI.AlertDialogHeader>
                <UI.AlertDialogTitle>Revoke client access?</UI.AlertDialogTitle>
                <UI.AlertDialogDescription>
                  This client will no longer read Staging secrets.
                </UI.AlertDialogDescription>
              </UI.AlertDialogHeader>
              {state === "Error" && (
                <Alert tone="bad">
                  <AlertDescription>Access could not be revoked. Try again.</AlertDescription>
                </Alert>
              )}
              <UI.AlertDialogFooter>
                <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
                <UI.AlertDialogAction asChild>
                  <Button variant="destructive" loading={state === "Pending"}>
                    Revoke access
                  </Button>
                </UI.AlertDialogAction>
              </UI.AlertDialogFooter>
            </UI.AlertDialogContent>
          </UI.AlertDialog>
        </ExampleCell>
      ))}
    </ExampleGrid>
  );
}
