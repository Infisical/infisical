import { useEffect, useId, useState } from "react";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import * as UI from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [saved, setSaved] = useState("staging");
  const [draft, setDraft] = useState(saved);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const close = () => {
    setDraft(saved);
    setOpen(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: draft !== saved,
    onDiscard: close
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
    <ExampleCell label={`Saved name: ${saved}`}>
      <UI.Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : requestDiscard())}>
        <UI.DialogTrigger asChild>
          <Button variant="outline">Rename environment</Button>
        </UI.DialogTrigger>
        <UI.DialogContent pending={saving}>
          <UI.DialogHeader>
            <UI.DialogTitle>Rename environment</UI.DialogTitle>
            <UI.DialogDescription>
              Closing with unsaved edits asks first. While saving, the dialog cannot close.
            </UI.DialogDescription>
          </UI.DialogHeader>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
            }}
          >
            <Field label="Environment name">
              <Input
                required
                disabled={saving}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
          </form>
          <UI.DialogFooter>
            <UI.DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </UI.DialogClose>
            <Button type="submit" form={formId} loading={saving} disabled={draft === saved}>
              Save Changes
            </Button>
          </UI.DialogFooter>
        </UI.DialogContent>
      </UI.Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your unsaved changes to this environment will be lost."
      />
    </ExampleCell>
  );
}
