import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Textarea } from "@app/components/v4/ui/textarea";

import { MAX_DESCRIPTION_LINES, nameSchema } from "../flows/create-folder-flow";

import flowStyles from "../flows/flows.module.css";

export function EditFolderDialog({
  name: defaultName,
  description: defaultDescription,
  showDescriptionOverwriteWarning,
  onClose,
  onSave
}: {
  name: string;
  description: string;
  showDescriptionOverwriteWarning: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [error, setError] = useState<string>();
  const submit = () => {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    onSave(parsed.data, description.trim() ? description : "");
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit folder</DialogTitle>
          <DialogDescription>Update the folder name and description.</DialogDescription>
        </DialogHeader>
        <form
          id="edit-folder-dialog"
          noValidate
          className={flowStyles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Name" error={error}>
            <Input
              autoFocus
              value={name}
              placeholder="Type your folder name"
              autoComplete="off"
              invalid={Boolean(error)}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          <Field
            label="Description"
            description={
              showDescriptionOverwriteWarning
                ? "Warning: Any changes made here will overwrite any custom edits in individual environment folders."
                : undefined
            }
          >
            <Textarea
              value={description}
              placeholder="Folder description"
              rows={3}
              maxLength={255}
              className={flowStyles.fixedTextarea}
              onChange={(event) =>
                setDescription(
                  event.target.value.split("\n").slice(0, MAX_DESCRIPTION_LINES).join("\n")
                )
              }
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-folder-dialog">
            Update folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
