import { useEffect, useState } from "react";
import { Controller, useWatch } from "react-hook-form";

import { Combobox } from "@app/components/v4/ui/combobox";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { JENKINS_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { JenkinsSyncScope } from "@app/hooks/api/secretSyncs/types/jenkins-sync";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ComboField,
  ConnectionField,
  enabledBadge,
  SwitchField,
  SyncField,
  type SyncView,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useSyncForm
} from "./sync-fields";

function RundeckDestination() {
  const { setValue } = useSyncForm();
  const projects = useConnectionOptions(useV4Adapter("secrets").useRundeckProjects);
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.project", "")} />
      <ComboField
        name="destinationConfig.project"
        label="Project"
        options={projects.map(({ name }) => ({ value: name, label: name }))}
        placeholder="Select a project..."
      />
      <TextField
        name="destinationConfig.path"
        label="Path"
        placeholder="/production"
        description={
          <>
            Secrets are stored in Rundeck Key Storage under{" "}
            <code>keys/project/[project][path]</code>.
          </>
        }
      />
    </Stack>
  );
}

function WindmillDestination() {
  const { setValue } = useSyncForm();
  const workspaces = useConnectionOptions(useV4Adapter("secrets").useWindmillWorkspaces);
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.workspace", "")} />
      <ComboField
        name="destinationConfig.workspace"
        label="Workspace"
        tooltip="The workspace must exist on the connection's Windmill instance."
        options={workspaces.map(({ name }) => ({ value: name, label: name }))}
        placeholder="Select a workspace..."
      />
      <TextField
        name="destinationConfig.path"
        label="Path"
        placeholder="f/folder-name/"
        tooltip={
          <>
            Must follow the Windmill{" "}
            <a
              href="https://www.windmill.dev/docs/core_concepts/roles_and_permissions#path"
              target="_blank"
              rel="noopener noreferrer"
            >
              owner path convention
            </a>
            , for example <code>f/folder/path/</code>.
          </>
        }
      />
    </Stack>
  );
}

function ChecklyDestination() {
  const { control, setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const accountId = useWatch({ control, name: "destinationConfig.accountId" }) as
    | string
    | undefined;
  const adapter = useV4Adapter("secrets");
  const accounts = useConnectionOptions(adapter.useChecklyAccounts);
  const groups =
    adapter.useChecklyGroups(
      { connectionId: connectionId ?? "", accountId: accountId ?? "" },
      { enabled: Boolean(connectionId && accountId) }
    ).data ?? [];
  const resetGroup = () => {
    setValue("destinationConfig.groupId", "");
    setValue("destinationConfig.groupName", undefined);
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.accountId", "");
          setValue("destinationConfig.accountName", "");
          resetGroup();
        }}
      />
      <ComboField
        name="destinationConfig.accountId"
        label="Account"
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
          meta: account.id
        }))}
        placeholder="Select an account..."
        onSelect={(id) => {
          setValue(
            "destinationConfig.accountName",
            accounts.find((account) => account.id === id)?.name ?? ""
          );
          resetGroup();
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.groupId"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Group"
            optional
            description="Scopes secrets to a check group instead of the account."
            error={error?.message}
          >
            <Combobox
              label="Group"
              value={field.value ?? ""}
              onValueChange={(id) => {
                const nextId = id === field.value ? "" : id;
                field.onChange(nextId);
                setValue(
                  "destinationConfig.groupName",
                  groups.find((group) => group.id === nextId)?.name
                );
              }}
              options={groups.map((group) => ({
                value: group.id,
                label: group.name,
                meta: group.id
              }))}
              placeholder="Select a group..."
              disabled={!connectionId || !accountId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
    </Stack>
  );
}

function DevinDestination() {
  return (
    <Stack gap={16}>
      <ConnectionField />
      <TextField
        name="destinationConfig.orgId"
        label="Organization ID"
        placeholder="org-..."
        tooltip="Find it in your Devin organization settings."
      />
    </Stack>
  );
}

function DaytonaDestination() {
  return <ConnectionField />;
}

function OnaDestination() {
  const { setValue } = useSyncForm();
  const projects = useConnectionOptions(useV4Adapter("secrets").useOnaProjects);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Ona project"
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
          meta: project.id
        }))}
        placeholder="Select a project..."
        onSelect={(id) =>
          setValue(
            "destinationConfig.projectName",
            projects.find((project) => project.id === id)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

const TRIGGER_DEV_ENVIRONMENT_TYPES: Record<string, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PREVIEW: "Preview",
  PRODUCTION: "Production"
};

function TriggerDevDestination() {
  const { control, setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const projectRef = useWatch({ control, name: "destinationConfig.projectRef" }) as
    | string
    | undefined;
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useTriggerDevProjects);
  const environments =
    adapter.useTriggerDevEnvironments(
      { connectionId: connectionId ?? "", projectRef: projectRef ?? "" },
      { enabled: Boolean(connectionId && projectRef) }
    ).data ?? [];
  const [orgId, setOrgId] = useState("");
  useEffect(() => {
    if (orgId || !projectRef) return;
    const project = projects.find((entry) => entry.id === projectRef);
    if (project) setOrgId(project.organization.id);
  }, [projectRef, projects, orgId]);
  const organizations = [
    ...new Map(projects.map((project) => [project.organization.id, project.organization])).values()
  ].sort((first, second) => first.name.localeCompare(second.name));
  const resetProject = () => {
    setValue("destinationConfig.projectRef", "");
    setValue("destinationConfig.environment", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setOrgId("");
          resetProject();
        }}
      />
      <SyncField label="Organization">
        <Combobox
          label="Organization"
          value={orgId}
          onValueChange={(id) => {
            if (id === orgId) return;
            setOrgId(id);
            resetProject();
          }}
          options={organizations.map((organization) => ({
            value: organization.id,
            label: organization.name,
            meta: organization.slug
          }))}
          placeholder="Select an organization..."
          disabled={!connectionId}
        />
      </SyncField>
      <ComboField
        name="destinationConfig.projectRef"
        label="Project"
        options={projects
          .filter((project) => project.organization.id === orgId)
          .map((project) => ({ value: project.id, label: project.name, meta: project.id }))}
        placeholder="Select a project..."
        disabled={!orgId}
        onSelect={() => setValue("destinationConfig.environment", "")}
      />
      <ComboField
        name="destinationConfig.environment"
        label="Environment"
        options={environments.map((environment) => ({
          value: environment.slug,
          label: TRIGGER_DEV_ENVIRONMENT_TYPES[environment.type] ?? environment.slug,
          meta: environment.slug
        }))}
        placeholder="Select an environment..."
        disabled={!projectRef}
      />
    </Stack>
  );
}

function TriggerDevOptions() {
  return (
    <SwitchField
      name="syncOptions.markAsSecret"
      label="Mark variables as secret"
      description="Synced variables are redacted in Trigger.dev."
    />
  );
}

const JENKINS_SCOPE_HELP: Record<JenkinsSyncScope, string> = {
  [JenkinsSyncScope.Global]:
    "Secrets are stored as Secret text credentials in the Jenkins global credentials store.",
  [JenkinsSyncScope.Folder]:
    "Secrets are stored as Secret text credentials in the selected folder's credentials store."
};

function JenkinsDestination() {
  const { control, setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const scope = useWatch({ control, name: "destinationConfig.scope" }) as
    | JenkinsSyncScope
    | undefined;
  const folders = useV4Adapter("secrets").useJenkinsFolders(connectionId ?? "", {
    enabled: Boolean(connectionId) && scope === JenkinsSyncScope.Folder
  });
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", JenkinsSyncScope.Global);
          setValue("destinationConfig.folderPath", "");
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Scope"
            description={scope ? JENKINS_SCOPE_HELP[scope] : undefined}
            error={error?.message}
          >
            <Select
              label="Scope"
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                setValue("destinationConfig.folderPath", "");
              }}
              options={Object.values(JenkinsSyncScope).map((value) => ({
                value,
                label: JENKINS_SYNC_SCOPE_LABELS[value]
              }))}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === JenkinsSyncScope.Folder && (
        <ComboField
          name="destinationConfig.folderPath"
          label="Folder"
          options={(folders.data ?? []).map(({ fullName }) => ({
            value: fullName,
            label: fullName
          }))}
          placeholder="Select a folder..."
          loading={folders.isPending && Boolean(connectionId)}
          emptyText={
            folders.error
              ? "Unable to load Jenkins folders. Check the connection's credentials and that its user has Job/Read on the folders."
              : undefined
          }
        />
      )}
    </Stack>
  );
}

export const AUTOMATION_SYNC_VIEWS: Record<
  | SecretSync.Rundeck
  | SecretSync.Windmill
  | SecretSync.Checkly
  | SecretSync.Devin
  | SecretSync.Daytona
  | SecretSync.Ona
  | SecretSync.TriggerDev
  | SecretSync.Jenkins,
  SyncView
> = {
  [SecretSync.Rundeck]: {
    Destination: RundeckDestination,
    defaults: { destinationConfig: { project: "", path: "" } },
    destinationReview: (config) => [
      ["Project", config.project],
      ["Path", config.path]
    ]
  },
  [SecretSync.Windmill]: {
    Destination: WindmillDestination,
    defaults: { destinationConfig: { workspace: "", path: "" } },
    destinationReview: (config) => [
      ["Workspace", config.workspace],
      ["Path", config.path]
    ]
  },
  [SecretSync.Checkly]: {
    Destination: ChecklyDestination,
    defaults: { destinationConfig: { accountId: "", accountName: "", groupId: "" } },
    destinationReview: (config) => [
      ["Account", config.accountName || config.accountId],
      ...(config.groupId ? [["Group", config.groupName || config.groupId] as const] : [])
    ]
  },
  [SecretSync.Devin]: {
    Destination: DevinDestination,
    defaults: { destinationConfig: { orgId: "" } },
    destinationReview: (config) => [["Organization ID", config.orgId]]
  },
  [SecretSync.Daytona]: {
    Destination: DaytonaDestination,
    defaults: { destinationConfig: {} },
    destinationReview: () => []
  },
  [SecretSync.Ona]: {
    Destination: OnaDestination,
    defaults: { destinationConfig: { projectId: "", projectName: "" } },
    destinationReview: (config) => [["Ona project", config.projectName || config.projectId]]
  },
  [SecretSync.TriggerDev]: {
    Destination: TriggerDevDestination,
    Options: TriggerDevOptions,
    defaults: {
      destinationConfig: { projectRef: "", environment: "" },
      syncOptions: { markAsSecret: true }
    },
    destinationReview: (config) => [
      ["Project", config.projectRef],
      ["Environment", config.environment]
    ],
    optionsReview: (options) => [["Mark variables as secret", enabledBadge(options.markAsSecret)]]
  },
  [SecretSync.Jenkins]: {
    Destination: JenkinsDestination,
    defaults: { destinationConfig: { scope: JenkinsSyncScope.Global, folderPath: "" } },
    destinationReview: (config) => [
      ["Scope", JENKINS_SYNC_SCOPE_LABELS[config.scope as JenkinsSyncScope] ?? config.scope],
      ...(config.scope === JenkinsSyncScope.Folder ? [["Folder", config.folderPath] as const] : [])
    ]
  }
};
