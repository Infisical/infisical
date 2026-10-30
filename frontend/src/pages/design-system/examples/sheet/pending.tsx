import { useEffect, useId, useState } from "react";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import * as UI from "@app/components/v4/ui/sheet";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [saved, setSaved] = useState("https://hooks.example.com/infisical");
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: draft !== saved,
    onDiscard: () => {
      setDraft(saved);
      setOpen(false);
    }
  });
  useEffect(() => {
    if (!saving) return undefined;
    const timer = window.setTimeout(() => {
      setSaved(draft);
      setSaving(false);
      setOpen(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [saving, draft]);
  return (
    <ExampleCell label={`Saved URL: ${saved}`}>
      <UI.Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : requestDiscard())}>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Edit webhook</Button>
        </UI.SheetTrigger>
        <UI.SheetContent pending={saving}>
          <UI.SheetHeader>
            <UI.SheetTitle>Edit webhook</UI.SheetTitle>
            <UI.SheetDescription>
              Closing with unsaved edits asks first. While saving, the sheet cannot close.
            </UI.SheetDescription>
          </UI.SheetHeader>
          <UI.SheetBody>
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault();
                setSaving(true);
              }}
            >
              <Field label="Endpoint URL">
                <Input
                  required
                  mono
                  disabled={saving}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </Field>
            </form>
          </UI.SheetBody>
          <UI.SheetFooter>
            <Button type="submit" form={formId} loading={saving} disabled={draft === saved}>
              Save Changes
            </Button>
            <UI.SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </UI.SheetClose>
          </UI.SheetFooter>
        </UI.SheetContent>
      </UI.Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your unsaved changes to this webhook will be lost."
      />
    </ExampleCell>
  );
}
