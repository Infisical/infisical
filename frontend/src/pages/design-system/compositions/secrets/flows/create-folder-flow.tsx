import { useState } from "react";
import { z } from "zod";

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

import { LOCAL_ONLY } from "./shared";
import type { AddFlowProps } from "./types";

import styles from "./flows.module.css";

const nameSchema = z
  .string()
  .trim()
  .max(255, "Name cannot exceed 255 characters")
  .regex(/^[a-zA-Z0-9-_]+$/, "Name can only contain letters, numbers, dashes, and underscores");
const MAX_DESCRIPTION_LINES = 10;

export function CreateFolderFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate,
  onNotice
}: AddFlowProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();

  const submit = () => {
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    const folderName = parsed.data;
    const missing = scope.visibleEnvironments.filter(
      (environment) =>
        !resources.some(
          (resource) =>
            resource.kind === "folder" &&
            resource.project === scope.project &&
            resource.environment === environment.value &&
            resource.path === scope.path &&
            resource.name === folderName
        )
    );
    onOpenChange(false);
    if (!missing.length) {
      onNotice({ title: "Folder already exists in all environments" });
      return;
    }
    onCreate(
      missing.map((environment) => ({
        kind: "folder",
        project: scope.project,
        environment: environment.value,
        path: scope.path,
        name: folderName,
        description: description.trim() ? description : ""
      })),
      { title: "Successfully created folder", description: LOCAL_ONLY }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add folder</DialogTitle>
          <DialogDescription>Add a new folder to organize your secrets.</DialogDescription>
        </DialogHeader>
        <form
          id="create-folder-flow"
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
          <Field label="Description">
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
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-folder-flow">
            Add folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
