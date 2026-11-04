import { useState } from "react";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
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
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Textarea } from "@app/components/v4/ui/textarea";

import type { EnvironmentOption } from "./cells";

import styles from "./overview.module.css";

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(255, "Name cannot exceed 255 characters")
  .regex(/^[a-zA-Z0-9-_]+$/, "Name can only contain letters, numbers, dashes, and underscores");
const secretNameSchema = z
  .string()
  .trim()
  .min(1, "Secret name is required")
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Use letters, numbers and underscores, starting with a letter or underscore"
  );
const MAX_DESCRIPTION_LINES = 10;

export type NewSecret = {
  key: string;
  value: string;
  comment: string;
  environments: string[];
  tagIds: string[];
};

export const CreateSecretDialog = ({
  environments,
  initial,
  tagOptions,
  onClose,
  onCreate
}: {
  environments: EnvironmentOption[];
  initial: { environments: string[]; name?: string };
  tagOptions: { value: string; label: string }[];
  onClose: () => void;
  onCreate: (secret: NewSecret) => Promise<unknown>;
}) => {
  const [key, setKey] = useState(initial.name ?? "");
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [targets, setTargets] = useState(initial.environments);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const parsed = secretNameSchema.safeParse(key);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setPending(true);
    try {
      await onCreate({ key: parsed.data, value, comment, environments: targets, tagIds });
    } finally {
      setPending(false);
    }
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
          <DialogTitle>Add secret</DialogTitle>
          <DialogDescription>Add a secret to the selected environments.</DialogDescription>
        </DialogHeader>
        <form
          id="create-secret-dialog"
          noValidate
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Key" error={error}>
            <Input
              autoFocus
              mono
              value={key}
              placeholder="DATABASE_URL"
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(error)}
              onChange={(event) => {
                setKey(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          <Field label="Value" optional>
            <Textarea
              mono
              value={value}
              rows={3}
              className={styles.fixedTextarea}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Field label="Environments">
            <MultiSelect
              label="Environments"
              options={environments}
              value={targets}
              onChange={setTargets}
              placeholder="Select environments"
            />
          </Field>
          <Field label="Tags" optional>
            <MultiSelect
              label="Tags"
              options={tagOptions}
              value={tagIds}
              onChange={setTagIds}
              placeholder="Select tags"
            />
          </Field>
          <Field label="Comment" optional>
            <Textarea
              value={comment}
              rows={2}
              className={styles.fixedTextarea}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-secret-dialog"
            loading={pending}
            disabled={!targets.length}
          >
            Add secret
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const FolderDialog = ({
  mode,
  name: defaultName = "",
  description: defaultDescription = "",
  showDescriptionOverwriteWarning,
  onClose,
  onSave
}: {
  mode: "create" | "edit";
  name?: string;
  description?: string;
  showDescriptionOverwriteWarning?: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<unknown>;
}) => {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const parsed = folderNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setPending(true);
    try {
      await onSave(parsed.data, description.trim() ? description : "");
    } finally {
      setPending(false);
    }
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
          <DialogTitle>{mode === "create" ? "Add folder" : "Edit folder"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a new folder to organize your secrets."
              : "Update the folder name and description."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="folder-dialog"
          noValidate
          className={styles.form}
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
              className={styles.fixedTextarea}
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
          <Button type="submit" form="folder-dialog" loading={pending}>
            {mode === "create" ? "Add folder" : "Update folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ConfirmDeleteDialog = ({
  title,
  description,
  action,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  action: string;
  onClose: () => void;
  onConfirm: () => unknown;
}) => (
  <AlertDialog
    open
    onOpenChange={(open) => {
      if (!open) onClose();
    }}
  >
    <AlertDialogContent tone="danger">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          {action}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
