import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import * as Dialog from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import * as UI from "@app/components/v4/ui/popover";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

function HostnameForm() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("vault.example.test");
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <UI.Popover open={open} onOpenChange={setOpen} modal>
        <UI.PopoverAnchor asChild>
          <p>Destination: {saved}</p>
        </UI.PopoverAnchor>
        <UI.PopoverTrigger asChild>
          <Button variant="outline">Edit destination</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent aria-label="Edit destination hostname">
          <UI.PopoverTitle>Destination hostname</UI.PopoverTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim() || draft.includes(" ")) {
                setError("Enter a hostname without spaces.");
                return;
              }
              setSaved(draft);
              setError("");
              setOpen(false);
            }}
          >
            <Field label="Hostname" error={error || undefined}>
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
            </Field>
            <Button type="submit">Apply hostname</Button>
          </form>
        </UI.PopoverContent>
      </UI.Popover>
    </div>
  );
}
export default function Example() {
  return (
    <ExampleGrid width="full">
      <ExampleCell label="Anchored form">
        <HostnameForm />
      </ExampleCell>
      <ExampleCell label="Inside a dialog">
        <Dialog.Dialog>
          <Dialog.DialogTrigger asChild>
            <Button variant="outline">Edit connection</Button>
          </Dialog.DialogTrigger>
          <Dialog.DialogContent>
            <Dialog.DialogHeader>
              <Dialog.DialogTitle>Connection editor</Dialog.DialogTitle>
              <Dialog.DialogDescription>
                Changes apply to this local connection only.
              </Dialog.DialogDescription>
            </Dialog.DialogHeader>
            <HostnameForm />
            <Dialog.DialogFooter showCloseButton />
          </Dialog.DialogContent>
        </Dialog.Dialog>
      </ExampleCell>
    </ExampleGrid>
  );
}
