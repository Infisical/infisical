import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Select } from "@infisical/cipher/ui/select";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useOrgId } from "../../../../access/permissions";
import { useV4Adapter } from "../../../../data/adapters";
import { importName, type Scope } from "../../secrets-model";
import { usePlanGates } from "../plan-gates";
import { useCreateBlock } from "../row-actions/permissions";
import { environmentLabel, folderExists, Gate } from "./shared";
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
  const createBlock = useCreateBlock(
    scope.project,
    ProjectPermissionSub.SecretImports,
    ProjectPermissionActions.Create,
    [destination],
    scope.path,
    "add secret imports here"
  );
  const [environment, setEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [replication, setReplication] = useState(false);
  const [error, setError] = useState<string>();
  const [fromOtherProject, setFromOtherProject] = useState(false);
  const [grant, setGrant] = useState<{ project?: string; environment?: string; path?: string }>({});
  const [grantErrors, setGrantErrors] = useState<{
    project?: string;
    environment?: string;
    path?: string;
  }>({});
  const { plan, guard } = usePlanGates();
  const policies = useV4Adapter("secretPolicies");
  const { data: gates } = policies.useGates(useOrgId());
  const { data: receivedGrants = [] } = policies.useFolderGrantsReceived(scope.project, {
    enabled: Boolean(gates?.allowCrossProjectSecretSharing && gates.crossProjectSecretSharingInPlan)
  });
  const unique = (values: { value: string; label: string }[]) =>
    values.filter(
      (entry, index) => values.findIndex((other) => other.value === entry.value) === index
    );
  const projectOptions = unique(
    receivedGrants.map((entry) => ({
      value: entry.sourceProjectId,
      label: entry.sourceProjectName
    }))
  );
  const projectGrants = receivedGrants.filter((entry) => entry.sourceProjectId === grant.project);
  const environmentOptions = unique(
    projectGrants.map((entry) => ({ value: entry.environmentSlug, label: entry.environmentName }))
  );
  const folderOptions = projectGrants
    .filter((entry) => entry.environmentSlug === grant.environment)
    .map((entry) => ({ value: entry.secretPath, label: entry.secretPath }));

  const alreadyImports = (source: Scope, replicated: boolean) =>
    resources.some(
      (resource) =>
        resource.kind === "import" &&
        resource.project === scope.project &&
        resource.environment === destination &&
        resource.path === scope.path &&
        resource.source.project === source.project &&
        resource.source.environment === source.environment &&
        resource.source.path === source.path &&
        Boolean(resource.replicated) === replicated
    );

  const submitFromGrant = () => {
    const next = {
      project: grant.project ? undefined : "Required",
      environment: grant.environment ? undefined : "Required",
      path: grant.path ? undefined : "Required"
    };
    setGrantErrors(next);
    if (!grant.project || !grant.environment || !grant.path) return;
    const source = { project: grant.project, environment: grant.environment, path: grant.path };
    if (alreadyImports(source, false)) {
      onError({
        title: "Import was not created",
        description: `This folder already imports ${grant.path} from that project.`
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
          name: importName(source, scope.project),
          source,
          revoked: false,
          replicated: false
        }
      ],
      { title: "Successfully linked secrets." }
    );
    onOpenChange(false);
  };

  const submit = () => {
    if (fromOtherProject) {
      submitFromGrant();
      return;
    }
    if (!environment) {
      setError("Required");
      return;
    }
    if (replication && plan && !plan.secretApproval) {
      guard("replication", () => undefined);
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
        description: `No folder exists at ${sourcePath || "an empty path"} in ${environmentLabel(environment)}.`
      });
      return;
    }
    if (alreadyImports(source, replication)) {
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
          name: importName(source, scope.project),
          source,
          revoked: false,
          replicated: replication
        }
      ],
      { title: "Successfully linked." }
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add secret import</DialogTitle>
          <DialogDescription>
            Reference secrets from another environment or folder. Changes at the source show up
            here.
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
          {projectOptions.length > 0 && (
            <Tabs
              variant="segmented"
              width="full"
              label="Import from"
              value={fromOtherProject ? "other" : "this"}
              onChange={(next) => setFromOtherProject(next === "other")}
              tabs={[
                { value: "this", label: "This project" },
                { value: "other", label: "Another project" }
              ]}
            />
          )}
          {fromOtherProject ? (
            <>
              <Field label="Project" error={grantErrors.project}>
                <Combobox
                  label="Project"
                  options={projectOptions}
                  value={grant.project ?? ""}
                  placeholder="Select project..."
                  invalid={Boolean(grantErrors.project)}
                  onValueChange={(value) => {
                    setGrant({ project: value });
                    setGrantErrors({});
                  }}
                />
              </Field>
              <Field label="Environment" error={grantErrors.environment}>
                <Combobox
                  label="Environment"
                  options={environmentOptions}
                  value={grant.environment ?? ""}
                  placeholder="Select environment..."
                  disabled={!grant.project}
                  invalid={Boolean(grantErrors.environment)}
                  onValueChange={(value) => {
                    setGrant((current) => ({ project: current.project, environment: value }));
                    setGrantErrors((current) => ({
                      ...current,
                      environment: undefined,
                      path: undefined
                    }));
                  }}
                />
              </Field>
              <Field label="Folder path" error={grantErrors.path}>
                <Combobox
                  label="Folder path"
                  options={folderOptions}
                  value={grant.path ?? ""}
                  placeholder="Select folder..."
                  disabled={!grant.environment}
                  invalid={Boolean(grantErrors.path)}
                  onValueChange={(value) => {
                    setGrant((current) => ({ ...current, path: value }));
                    setGrantErrors((current) => ({ ...current, path: undefined }));
                  }}
                />
              </Field>
            </>
          ) : (
            <>
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
            </>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Gate reason={createBlock}>
            <Button type="submit" form="create-import-flow" disabled={Boolean(createBlock)}>
              Create import
            </Button>
          </Gate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
