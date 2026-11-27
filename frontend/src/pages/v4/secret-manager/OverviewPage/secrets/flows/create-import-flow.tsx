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
import { SmallText } from "@infisical/cipher/ui/text";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useOrgId } from "../../../../access/permissions";
import { useV4Adapter } from "../../../../data/adapters";
import { importName } from "../../secrets-model";
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
  const policies = useV4Adapter("secretPolicies");
  const gates = policies.useGates(useOrgId()).data;
  const { data: grants = [] } = policies.useReceivedFolderGrants(scope.project, {
    enabled:
      open &&
      Boolean(gates?.allowCrossProjectSecretSharing && gates.crossProjectSecretSharingInPlan)
  });
  const [sourceProject, setSourceProject] = useState(scope.project);
  const [environment, setEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [replication, setReplication] = useState(false);
  const [errors, setErrors] = useState<{ environment?: string; path?: string }>({});
  const { plan, guard } = usePlanGates();

  const crossProject = sourceProject !== scope.project;
  const projectGrants = grants.filter((grant) => grant.sourceProjectId === sourceProject);
  const projectOptions = [
    { value: scope.project, label: "This project" },
    ...[...new Map(grants.map((grant) => [grant.sourceProjectId, grant])).values()].map(
      (grant) => ({ value: grant.sourceProjectId, label: grant.sourceProjectName })
    )
  ];
  const environmentOptions = crossProject
    ? [...new Map(projectGrants.map((grant) => [grant.environmentSlug, grant])).values()].map(
        (grant) => ({
          value: grant.environmentSlug,
          label: grant.environmentName,
          meta: grant.environmentSlug
        })
      )
    : scope.environments.map((entry) => ({ ...entry, meta: entry.value }));
  const pathOptions = projectGrants
    .filter((grant) => grant.environmentSlug === environment)
    .map((grant) => ({ value: grant.secretPath, label: grant.secretPath }));

  const submitCrossProject = () => {
    const grant = projectGrants.find(
      (entry) => entry.environmentSlug === environment && entry.secretPath === secretPath
    );
    if (!grant) {
      setErrors({
        environment: environment ? undefined : "Required",
        path: "Required"
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
          resource.source.project === grant.sourceProjectId &&
          resource.source.environment === grant.environmentSlug &&
          resource.source.path === grant.secretPath
      )
    ) {
      onError({
        title: "Import was not created",
        description: `This folder already imports ${grant.secretPath} from ${grant.sourceProjectName}.`
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
          name: importName(
            scope.project,
            grant.sourceProjectId,
            grant.environmentSlug,
            grant.secretPath
          ),
          source: {
            project: grant.sourceProjectId,
            environment: grant.environmentSlug,
            path: grant.secretPath
          },
          sourceProjectName: grant.sourceProjectName,
          revoked: false,
          replicated: false
        }
      ],
      { title: "Successfully linked." }
    );
    onOpenChange(false);
  };

  const submit = () => {
    if (crossProject) {
      submitCrossProject();
      return;
    }
    if (!environment) {
      setErrors({ environment: "Required" });
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
    if (
      resources.some(
        (resource) =>
          resource.kind === "import" &&
          resource.project === scope.project &&
          resource.environment === destination &&
          resource.path === scope.path &&
          resource.source.environment === environment &&
          resource.source.path === sourcePath &&
          Boolean(resource.replicated) === replication
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
            {grants.length > 0
              ? "Reference secrets from another environment, folder or project. Changes at the source show up here."
              : "Reference secrets from another environment or folder. Changes at the source show up here."}
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
          {grants.length > 0 && (
            <Field label="Project">
              <Combobox
                label="Project"
                options={projectOptions}
                value={sourceProject}
                onValueChange={(value) => {
                  setSourceProject(value);
                  setEnvironment("");
                  setSecretPath("/");
                  setErrors({});
                }}
              />
            </Field>
          )}
          <Field label="Environment" error={errors.environment}>
            <Combobox
              label="Environment"
              options={environmentOptions}
              value={environment}
              placeholder="Select environment..."
              invalid={Boolean(errors.environment)}
              onValueChange={(value) => {
                setEnvironment(value);
                if (crossProject) setSecretPath("");
                setErrors({});
              }}
            />
          </Field>
          <Field label="Secret path" error={errors.path}>
            {crossProject ? (
              <Combobox
                label="Secret path"
                options={pathOptions}
                value={secretPath}
                placeholder={environment ? "Select folder..." : "Select an environment first"}
                disabled={!environment}
                invalid={Boolean(errors.path)}
                onValueChange={(value) => {
                  setSecretPath(value);
                  setErrors({});
                }}
              />
            ) : (
              <Input
                mono
                value={secretPath}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setSecretPath(event.target.value)}
              />
            )}
          </Field>
          {!crossProject && (
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
