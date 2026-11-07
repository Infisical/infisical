import { useState } from "react";

import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [open, setOpen] = useState(false);
  const [discarded, setDiscarded] = useState(0);
  return (
    <ExampleCell label={`Discarded ${discarded} ${discarded === 1 ? "draft" : "drafts"}`}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Close Draft
      </Button>
      <DiscardChangesAlertDialog
        open={open}
        onOpenChange={setOpen}
        onDiscard={() => {
          setDiscarded((count) => count + 1);
          setOpen(false);
        }}
        description="Your unsaved changes to this skill will be lost."
      />
    </ExampleCell>
  );
}
