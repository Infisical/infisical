import { useEffect, useRef, useState } from "react";

import * as UI from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  let label = "Ready";
  if (deleting) label = "Deleting";
  else if (deleted) label = "Deleted in this local example";
  return (
    <ExampleCell label={label}>
      <UI.AlertDialog open={open} onOpenChange={setOpen}>
        <UI.AlertDialogTrigger asChild>
          <Button variant="outline">Delete connection</Button>
        </UI.AlertDialogTrigger>
        <UI.AlertDialogContent tone="danger">
          <UI.AlertDialogHeader>
            <UI.AlertDialogTitle>Delete production-postgres?</UI.AlertDialogTitle>
            <UI.AlertDialogDescription>
              Syncs and rotations that use this connection stop.
            </UI.AlertDialogDescription>
          </UI.AlertDialogHeader>
          <UI.AlertDialogFooter>
            <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
            <UI.AlertDialogAction
              variant="destructive"
              loading={deleting}
              onClick={() => {
                setDeleting(true);
                timer.current = window.setTimeout(() => {
                  setDeleting(false);
                  setDeleted(true);
                  setOpen(false);
                }, 2000);
              }}
            >
              Delete connection
            </UI.AlertDialogAction>
          </UI.AlertDialogFooter>
        </UI.AlertDialogContent>
      </UI.AlertDialog>
    </ExampleCell>
  );
}
