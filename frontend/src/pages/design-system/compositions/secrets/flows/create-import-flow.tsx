import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
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
import { Select } from "@app/components/v4/ui/select";
import { SmallText } from "@app/components/v4/ui/text";

import { environmentLabel, folderExists, LOCAL_ONLY } from "./shared";
import type { AddFlowProps } from "./types";

import styles from "./flows.module.css";

const replicationOptions = [
  { value: "false", label: "Ignore secret approval policies" },
  { value: "true", label: "Respect secret approval policies" }
];

export function CreateImportFlow({
  open,
  onOpenChange,
  scope,
  resources,
  onCreate,
  onError
}: AddFlowProps) {
  const destination = scope.visibleEnvironments[0].value;
  const [environment, setEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [replication, setReplication] = useState(false);
  const [error, setError] = useState<string>();

  const submit = () => {
    if (!environment) {
      setError("Required");
      return;
    }
    const trimmed = secretPath.trim();
    const sourcePath = trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    const source = { project: scope.project, environment, path: sourcePath };
    if (environment === destination && sourcePath === scope.path) {
      onError({
        title: "Import was not created",
        description:
          "A folder cannot import secrets from itself. Choose another environment or path."
      });
      return;
    }
    if (
      !sourcePath.startsWith("/") ||
      !folderExists(resources, scope.project, environment, sourcePath)
    ) {
      onError({
        title: "Import was not created",
        description: `No folder exists at ${sourcePath || "an empty path"} in ${environmentLabel(environment)} in local demo data.`
      });
      return;
    }
    if (
      resources.some(
        (resource) =>
          resource.kind === "import" &&
          resource.project === scope.project &&
          resource.environment === destination &&
          resource.path === scope.path &&
          resource.source.environment === environment &&
          resource.source.path === sourcePath
      )
    ) {
      onError({
        title: "Import was not created",
        description: `This folder already imports ${sourcePath} from ${environmentLabel(environment)}.`
      });
      return;
    }
    onCreate(
      [
        {
          kind: "import",
          project: scope.project,
          environment: destination,
          path: scope.path,
          name: `${environment}:${sourcePath}`,
          source,
          revoked: false,
          replicated: replication
        }
      ],
      { title: "Successfully linked.", description: LOCAL_ONLY }
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add secret import</DialogTitle>
          <DialogDescription>
            Import secrets from this project or from another project that has granted you access.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-import-flow"
          noValidate
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Environment" error={error}>
            <Combobox
              label="Environment"
              options={scope.environments.map((entry) => ({ ...entry, meta: entry.value }))}
              value={environment}
              placeholder="Select environment..."
              invalid={Boolean(error)}
              onValueChange={(value) => {
                setEnvironment(value);
                setError(undefined);
              }}
            />
          </Field>
          <Field label="Secret path">
            <Input
              mono
              value={secretPath}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setSecretPath(event.target.value)}
            />
          </Field>
          <div className={styles.stackTight}>
            <Select
              label="Secret approval policies"
              value={replication ? "true" : "false"}
              options={replicationOptions}
              onChange={(value) => setReplication(value === "true")}
            />
            <SmallText muted>
              {replication
                ? "Secrets from the source will be automatically sent to the destination. If approval policies exist at the destination, the secrets will be sent as approval requests instead of being applied immediately."
                : "Secrets from the source location will be imported to the selected destination immediately, ignoring any approval policies at the destination."}
            </SmallText>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-import-flow">
            Create import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
