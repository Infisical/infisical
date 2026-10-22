import { useState } from "react";

import * as UI from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="danger">
        <UI.AlertDialog
          open={open === "danger"}
          onOpenChange={(next) => setOpen(next ? "danger" : null)}
        >
          <UI.AlertDialogTrigger asChild>
            <Button variant="outline">Delete project</Button>
          </UI.AlertDialogTrigger>
          <UI.AlertDialogContent tone="danger" confirmText="payments-api">
            <UI.AlertDialogHeader>
              <UI.AlertDialogTitle>Delete payments-api?</UI.AlertDialogTitle>
              <UI.AlertDialogDescription>
                All 52 secrets, 9 environments and their history are removed. This cannot be undone.
              </UI.AlertDialogDescription>
            </UI.AlertDialogHeader>
            <UI.AlertDialogFooter>
              <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
              <UI.AlertDialogAction variant="destructive">Delete project</UI.AlertDialogAction>
            </UI.AlertDialogFooter>
          </UI.AlertDialogContent>
        </UI.AlertDialog>
      </ExampleCell>
      <ExampleCell label="neutral">
        <UI.AlertDialog
          open={open === "neutral"}
          onOpenChange={(next) => setOpen(next ? "neutral" : null)}
        >
          <UI.AlertDialogTrigger asChild>
            <Button variant="outline">Rotate key</Button>
          </UI.AlertDialogTrigger>
          <UI.AlertDialogContent tone="neutral">
            <UI.AlertDialogHeader>
              <UI.AlertDialogTitle>Rotate the signing key?</UI.AlertDialogTitle>
              <UI.AlertDialogDescription>
                Clients pick up the new key on their next request.
              </UI.AlertDialogDescription>
            </UI.AlertDialogHeader>
            <UI.AlertDialogFooter>
              <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
              <UI.AlertDialogAction>Rotate key</UI.AlertDialogAction>
            </UI.AlertDialogFooter>
          </UI.AlertDialogContent>
        </UI.AlertDialog>
      </ExampleCell>
    </ExampleGrid>
  );
}
