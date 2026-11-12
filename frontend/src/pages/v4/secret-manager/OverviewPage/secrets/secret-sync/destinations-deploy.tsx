import { useState } from "react";
import { Controller, type FieldValues, useWatch } from "react-hook-form";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Alert } from "@app/components/v4/ui/alert";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { Switch } from "@app/components/v4/ui/switch";
import { HUMANITEC_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  TERRAFORM_CLOUD_SYNC_SCOPES,
  TerraformCloudSyncCategory,
  TerraformCloudSyncScope
} from "@app/hooks/api/appConnections/terraform-cloud/types";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";
import { OctopusDeploySyncScope } from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";
import { QoveryVariableType } from "@app/hooks/api/secretSyncs/types/qovery-sync";
import {
  SpaceliftConfigType,
  SpaceliftFileMountFormat
} from "@app/hooks/api/secretSyncs/types/spacelift-sync";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ComboField,
  ConnectionField,
  enabledBadge,
  labelFor,
  MultiComboField,
  type ReviewItems,
  SelectField,
  SwitchField,
  SyncField,
  type SyncView,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useSyncForm
} from "./sync-fields";

const TERRAFORM_SCOPES = [
  { value: TerraformCloudSyncScope.VariableSet, label: "Variable set" },
  { value: TerraformCloudSyncScope.Workspace, label: "Workspace" }
];

const TERRAFORM_CATEGORIES = [
  { value: TerraformCloudSyncCategory.Environment, label: "Environment" },
  { value: TerraformCloudSyncCategory.Terraform, label: "Terraform" }
];

function TerraformCloudDestination() {
  const { control, setValue } = useSyncForm();
  const [scope, orgId] = useWatch({
    control,
    name: ["destinationConfig.scope", "destinationConfig.org"]
  }) as [string, string];
  const organizations = useConnectionOptions(
    useV4Adapter("secrets").useTerraformCloudOrganizations
  );
  const selectedOrg = organizations.find((org) => org.id === orgId);
  const resetTargets = () => {
    setValue("destinationConfig.variableSetId", "");
    setValue("destinationConfig.variableSetName", "");
    setValue("destinationConfig.workspaceId", "");
    setValue("destinationConfig.workspaceName", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          resetTargets();
        }}
      />
      <ComboField
        name="destinationConfig.org"
        label="Organization"
        options={organizations.map((org) => ({ value: org.id, label: org.name }))}
        placeholder="Select an organization..."
        onSelect={resetTargets}
      />
      <SelectField
        name="destinationConfig.category"
        label="Category"
        tooltip={
          <Stack gap={8}>
            <span>
              Environment variables configure Terraform&apos;s behavior, such as credentials.
            </span>
            <span>Terraform variables are input values in your configuration.</span>
          </Stack>
        }
        options={TERRAFORM_CATEGORIES}
        placeholder="Select a category..."
        defaultValue={TerraformCloudSyncCategory.Environment}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Scope"
            error={error?.message}
            tooltip={
              <Stack gap={8}>
                {Object.values(TERRAFORM_CLOUD_SYNC_SCOPES).map(({ name, description }) => (
                  <span key={name}>
                    {name}: {description}
                  </span>
                ))}
              </Stack>
            }
          >
            <Select
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                resetTargets();
              }}
              options={TERRAFORM_SCOPES}
              placeholder="Select a scope..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === TerraformCloudSyncScope.VariableSet && (
        <ComboField
          name="destinationConfig.variableSetId"
          label="Variable set"
          options={(selectedOrg?.variableSets ?? []).map((variableSet) => ({
            value: variableSet.id,
            label: variableSet.name,
            meta: variableSet.id
          }))}
          placeholder="Select a variable set..."
          disabled={!orgId}
          onSelect={(id) =>
            setValue(
              "destinationConfig.variableSetName",
              selectedOrg?.variableSets.find((variableSet) => variableSet.id === id)?.name ?? ""
            )
          }
        />
      )}
      {scope === TerraformCloudSyncScope.Workspace && (
        <ComboField
          name="destinationConfig.workspaceId"
          label="Workspace"
          options={(selectedOrg?.workspaces ?? []).map((workspace) => ({
            value: workspace.id,
            label: workspace.name,
            meta: workspace.id
          }))}
          placeholder="Select a workspace..."
          disabled={!orgId}
          onSelect={(id) =>
            setValue(
              "destinationConfig.workspaceName",
              selectedOrg?.workspaces.find((workspace) => workspace.id === id)?.name ?? ""
            )
          }
        />
      )}
    </Stack>
  );
}

const terraformCloudReview = (config: FieldValues): ReviewItems => [
  ["Scope", labelFor(TERRAFORM_SCOPES, config.scope)],
  ["Organization", config.org],
  config.scope === TerraformCloudSyncScope.Workspace
    ? ["Workspace", config.workspaceName]
    : ["Variable set", config.variableSetName],
  ["Category", labelFor(TERRAFORM_CATEGORIES, config.category)]
];

const OCTOPUS_SCOPES = [{ value: OctopusDeploySyncScope.Project, label: "Project" }];

const EMPTY_OCTOPUS_SCOPE_VALUES = {
  environments: [],
  roles: [],
  processes: [],
  actions: [],
  machines: [],
  channels: []
};

const OCTOPUS_SCOPE_FIELDS = [
  { key: "environments", label: "Environments", noun: "environments" },
  { key: "roles", label: "Target tags", noun: "target tags" },
  { key: "machines", label: "Targets", noun: "targets" },
  { key: "processes", label: "Processes", noun: "processes" },
  { key: "actions", label: "Deployment steps", noun: "deployment steps" },
  { key: "channels", label: "Channels", noun: "channels" }
] as const;

function OctopusDeployDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, spaceId, scope, projectId, scopeValues] = useWatch({
    control,
    name: [
      "connection.id",
      "destinationConfig.spaceId",
      "destinationConfig.scope",
      "destinationConfig.projectId",
      "destinationConfig.scopeValues"
    ]
  }) as [string | undefined, string, string, string, Record<string, string[]> | undefined];
  const [openItem, setOpenItem] = useState(
    Object.values(scopeValues ?? {}).some((ids) => ids?.length) ? "advanced" : ""
  );
  const adapter = useV4Adapter("secrets");
  const spaces = useConnectionOptions(adapter.useOctopusDeploySpaces);
  const projects =
    adapter.useOctopusDeployProjects(
      { connectionId: connectionId ?? "", spaceId: spaceId ?? "" },
      { enabled: Boolean(connectionId && spaceId && scope) }
    ).data ?? [];
  const scopeData = adapter.useOctopusDeployScopeValues(
    { connectionId: connectionId ?? "", spaceId: spaceId ?? "", projectId: projectId ?? "" },
    { enabled: Boolean(connectionId && spaceId && projectId && scope) }
  ).data;
  const resetProject = () => {
    setValue("destinationConfig.projectId", "");
    setValue("destinationConfig.projectName", "");
    setValue("destinationConfig.scopeValues", EMPTY_OCTOPUS_SCOPE_VALUES);
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.spaceId", "");
          setValue("destinationConfig.spaceName", "");
          resetProject();
        }}
      />
      <ComboField
        name="destinationConfig.spaceId"
        label="Space"
        options={spaces.map((space) => ({ value: space.id, label: space.name, meta: space.slug }))}
        emptyText="No spaces found."
        placeholder="Select a space..."
        onSelect={(id) => {
          setValue(
            "destinationConfig.spaceName",
            spaces.find((space) => space.id === id)?.name ?? ""
          );
          resetProject();
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Scope" error={error?.message}>
            <Select
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                resetProject();
              }}
              options={OCTOPUS_SCOPES}
              placeholder="Select a scope..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === OctopusDeploySyncScope.Project && (
        <ComboField
          name="destinationConfig.projectId"
          label="Project"
          options={projects.map((project) => ({
            value: project.id,
            label: project.name,
            meta: project.slug
          }))}
          emptyText="No projects found."
          placeholder="Select a project..."
          disabled={!spaceId}
          onSelect={(id) => {
            setValue(
              "destinationConfig.projectName",
              projects.find((project) => project.id === id)?.name ?? ""
            );
            setValue("destinationConfig.scopeValues", EMPTY_OCTOPUS_SCOPE_VALUES);
          }}
        />
      )}
      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem}>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced</AccordionTrigger>
          <AccordionContent>
            <Stack gap={16}>
              {OCTOPUS_SCOPE_FIELDS.map(({ key, label, noun }) => (
                <MultiComboField
                  key={key}
                  name={`destinationConfig.scopeValues.${key}`}
                  label={label}
                  options={(scopeData?.[key] ?? []).map((entry) => ({
                    value: entry.id,
                    label: entry.name
                  }))}
                  emptyText={`No ${noun} found.`}
                  placeholder={`Select ${noun}...`}
                  disabled={scope !== OctopusDeploySyncScope.Project || !projectId}
                />
              ))}
            </Stack>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Stack>
  );
}

function OctopusScopeNames({
  config,
  field
}: {
  config: FieldValues;
  field: (typeof OCTOPUS_SCOPE_FIELDS)[number]["key"];
}) {
  const connectionId = useConnectionId();
  const { data } = useV4Adapter("secrets").useOctopusDeployScopeValues(
    {
      connectionId: connectionId ?? "",
      spaceId: config.spaceId ?? "",
      projectId: config.projectId ?? ""
    },
    { enabled: Boolean(connectionId && config.spaceId && config.projectId) }
  );
  return (config.scopeValues[field] as string[])
    .map((id) => data?.[field].find((entry) => entry.id === id)?.name ?? id)
    .join(", ");
}

const octopusDeployReview = (config: FieldValues): ReviewItems => [
  ["Space", config.spaceName || config.spaceId],
  ["Scope", labelFor(OCTOPUS_SCOPES, config.scope)],
  ["Project", config.projectName || config.projectId],
  ...OCTOPUS_SCOPE_FIELDS.filter(({ key }) => config.scopeValues?.[key]?.length).map(
    ({ key, label }) => [label, <OctopusScopeNames config={config} field={key} />] as const
  )
];

const SPACELIFT_CONFIG_TYPES = [
  { value: SpaceliftConfigType.EnvironmentVariable, label: "Environment variables" },
  { value: SpaceliftConfigType.FileMount, label: "File mount" }
];

const SPACELIFT_FILE_FORMATS = [
  { value: SpaceliftFileMountFormat.DotEnv, label: ".env file" },
  { value: SpaceliftFileMountFormat.SecretPerFile, label: "One secret per file" }
];

function SpaceliftDestination() {
  const { control, setValue } = useSyncForm();
  const [configType, fileMountFormat] = useWatch({
    control,
    name: ["destinationConfig.configType", "destinationConfig.fileMountFormat"]
  }) as [string, string | undefined];
  const contexts = useConnectionOptions(useV4Adapter("secrets").useSpaceliftContexts);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.contextId", "");
          setValue("destinationConfig.contextName", "");
        }}
      />
      <ComboField
        name="destinationConfig.contextId"
        label="Context"
        options={contexts.map((context) => ({
          value: context.id,
          label: context.name,
          meta: context.id
        }))}
        placeholder="Select a context..."
        onSelect={(id) =>
          setValue(
            "destinationConfig.contextName",
            contexts.find((context) => context.id === id)?.name ?? ""
          )
        }
      />
      <Controller
        control={control}
        name="destinationConfig.configType"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Config type" error={error?.message}>
            <Select
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                if (next === SpaceliftConfigType.FileMount) {
                  setValue("destinationConfig.fileMountFormat", SpaceliftFileMountFormat.DotEnv);
                  return;
                }
                setValue("destinationConfig.mountPath", "");
                setValue("destinationConfig.fileMountFormat", undefined);
              }}
              options={SPACELIFT_CONFIG_TYPES}
              placeholder="Select a config type..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {configType === SpaceliftConfigType.FileMount && (
        <>
          <SelectField
            name="destinationConfig.fileMountFormat"
            label="File format"
            options={SPACELIFT_FILE_FORMATS}
            placeholder="Select a file format..."
            defaultValue={SpaceliftFileMountFormat.DotEnv}
          />
          {fileMountFormat === SpaceliftFileMountFormat.SecretPerFile ? (
            <TextField
              name="destinationConfig.mountPath"
              label="Directory path"
              optional
              placeholder="secrets/"
              tooltip={
                <>
                  Files are mounted at{" "}
                  <code>/mnt/workspace/&lt;directory&gt;/&lt;secret-key&gt;</code>. Leave empty to
                  mount directly in <code>/mnt/workspace/</code>.
                </>
              }
            />
          ) : (
            <TextField
              name="destinationConfig.mountPath"
              label="File path"
              placeholder="secrets.env"
            />
          )}
        </>
      )}
    </Stack>
  );
}

function SpaceliftOptions() {
  const { control } = useSyncForm();
  const [writeOnly, disableSecretDeletion] = useWatch({
    control,
    name: ["syncOptions.writeOnly", "syncOptions.disableSecretDeletion"]
  }) as [boolean | undefined, boolean | undefined];
  return (
    <Stack gap={16}>
      <SwitchField
        name="syncOptions.writeOnly"
        label="Mark as secret"
        description="Secret values are only available to runs and tasks, not the web UI or API."
      />
      {writeOnly && !disableSecretDeletion && (
        <Alert tone="warn" title="Secret values cannot be read back">
          Infisical can&apos;t read existing values in the Spacelift context, so any secret not in
          Infisical is deleted during sync. Turn on secret deletion protection to keep them.
        </Alert>
      )}
    </Stack>
  );
}

const spaceliftReview = (config: FieldValues): ReviewItems => {
  const isFileMount = config.configType === SpaceliftConfigType.FileMount;
  const isSecretPerFile = config.fileMountFormat === SpaceliftFileMountFormat.SecretPerFile;
  return [
    ["Context", config.contextName],
    ["Context ID", config.contextId],
    ["Config type", labelFor(SPACELIFT_CONFIG_TYPES, config.configType)],
    ...(isFileMount
      ? [["File format", isSecretPerFile ? "One secret per file" : ".env file"] as const]
      : []),
    ...(isFileMount && config.mountPath
      ? [[isSecretPerFile ? "Directory path" : "File path", config.mountPath] as const]
      : [])
  ];
};

function HumanitecDestination() {
  const { control, setValue } = useSyncForm();
  const [scope, orgId, appId] = useWatch({
    control,
    name: ["destinationConfig.scope", "destinationConfig.org", "destinationConfig.app"]
  }) as [string, string, string];
  const organizations = useConnectionOptions(useV4Adapter("secrets").useHumanitecOrganizations);
  const selectedOrg = organizations.find((org) => org.id === orgId);
  const selectedApp = selectedOrg?.apps?.find((app) => app.id === appId);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.env", "");
        }}
      />
      <ComboField
        name="destinationConfig.org"
        label="Organization"
        options={organizations.map((org) => ({ value: org.id, label: org.name }))}
        placeholder="Select an organization..."
        onSelect={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.env", "");
        }}
      />
      <ComboField
        name="destinationConfig.app"
        label="App"
        tooltip="The app must exist in the selected organization, and the connection's service account needs write permission on it."
        options={(selectedOrg?.apps ?? []).map((app) => ({
          value: app.id,
          label: app.name,
          meta: app.id
        }))}
        placeholder="Select an app..."
        disabled={!orgId}
        onSelect={() => setValue("destinationConfig.env", "")}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Scope"
            error={error?.message}
            tooltip={
              <Stack gap={8}>
                {Object.values(HUMANITEC_SYNC_SCOPES).map(({ name, description }) => (
                  <span key={name}>
                    {name}: {description}
                  </span>
                ))}
              </Stack>
            }
          >
            <Select
              value={field.value ?? ""}
              onValueChange={(next) => {
                field.onChange(next);
                setValue("destinationConfig.env", "");
              }}
              options={Object.values(HumanitecSyncScope).map((value) => ({
                value,
                label: HUMANITEC_SYNC_SCOPES[value].name
              }))}
              placeholder="Select a scope..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === HumanitecSyncScope.Environment && (
        <ComboField
          name="destinationConfig.env"
          label="Environment"
          options={(selectedApp?.envs ?? []).map((env) => ({ value: env.id, label: env.name }))}
          placeholder="Select an environment..."
          disabled={!appId}
        />
      )}
    </Stack>
  );
}

const humanitecReview = (config: FieldValues): ReviewItems => [
  ["Scope", HUMANITEC_SYNC_SCOPES[config.scope as HumanitecSyncScope]?.name ?? config.scope],
  ["Organization", config.org],
  ["Application", config.app],
  ...(config.scope === HumanitecSyncScope.Environment ? [["Environment", config.env] as const] : [])
];

function NorthflankDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, projectId] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.projectId"]
  }) as [string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useNorthflankProjects);
  const secretGroups =
    adapter.useNorthflankSecretGroups(
      { connectionId: connectionId ?? "", projectId: projectId ?? "" },
      { enabled: Boolean(connectionId && projectId) }
    ).data ?? [];
  const resetSecretGroup = () => {
    setValue("destinationConfig.secretGroupId", "");
    setValue("destinationConfig.secretGroupName", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          resetSecretGroup();
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Project"
        tooltip="The project must exist in the connection's Northflank team, and the connection needs access to it."
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
          meta: project.id
        }))}
        placeholder="Select a project..."
        onSelect={(id) => {
          setValue(
            "destinationConfig.projectName",
            projects.find((project) => project.id === id)?.name ?? ""
          );
          resetSecretGroup();
        }}
      />
      <ComboField
        name="destinationConfig.secretGroupId"
        label="Secret group"
        tooltip="The secret group must exist in the selected project, and the connection needs access to it."
        options={secretGroups.map((group) => ({
          value: group.id,
          label: group.name,
          meta: group.id
        }))}
        placeholder="Select a secret group..."
        disabled={!projectId}
        onSelect={(id) =>
          setValue(
            "destinationConfig.secretGroupName",
            secretGroups.find((group) => group.id === id)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

const northflankReview = (config: FieldValues): ReviewItems => [
  ["Project", config.projectName || config.projectId],
  ["Secret group", config.secretGroupName || config.secretGroupId]
];

const NO_QOVERY_ENVIRONMENT = "none";

function QoveryDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, organizationId, projectId] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.organizationId", "destinationConfig.projectId"]
  }) as [string | undefined, string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const organizations = useConnectionOptions(adapter.useQoveryOrganizations);
  const projects =
    adapter.useQoveryProjects(
      { connectionId: connectionId ?? "", organizationId: organizationId ?? "" },
      { enabled: Boolean(connectionId && organizationId) }
    ).data ?? [];
  const environments =
    adapter.useQoveryEnvironments(
      { connectionId: connectionId ?? "", projectId: projectId ?? "" },
      { enabled: Boolean(connectionId && projectId) }
    ).data ?? [];
  const resetEnvironment = () => {
    setValue("destinationConfig.environmentId", "");
    setValue("destinationConfig.environmentName", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.organizationId", "");
          setValue("destinationConfig.organizationName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          resetEnvironment();
          setValue("destinationConfig.variableType", QoveryVariableType.Secret);
        }}
      />
      <ComboField
        name="destinationConfig.organizationId"
        label="Organization"
        options={organizations.map((org) => ({ value: org.id, label: org.name }))}
        placeholder="Select an organization..."
        onSelect={(id) => {
          setValue(
            "destinationConfig.organizationName",
            organizations.find((org) => org.id === id)?.name ?? ""
          );
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          resetEnvironment();
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Project"
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        placeholder="Select a project..."
        disabled={!organizationId}
        onSelect={(id) => {
          setValue(
            "destinationConfig.projectName",
            projects.find((project) => project.id === id)?.name ?? ""
          );
          resetEnvironment();
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.environmentId"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Environment" optional error={error?.message}>
            <Combobox
              label="Environment"
              value={field.value || NO_QOVERY_ENVIRONMENT}
              onValueChange={(id) => {
                const environment = environments.find((entry) => entry.id === id);
                field.onChange(environment?.id ?? "");
                setValue("destinationConfig.environmentName", environment?.name ?? "");
              }}
              options={[
                { value: NO_QOVERY_ENVIRONMENT, label: "None (project level)" },
                ...environments.map((environment) => ({
                  value: environment.id,
                  label: environment.name
                }))
              ]}
              placeholder="Select an environment..."
              disabled={!connectionId || !projectId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
    </Stack>
  );
}

function QoveryOptions() {
  const { control } = useSyncForm();
  return (
    <Controller
      control={control}
      name="destinationConfig.variableType"
      render={({ field }) => (
        <Switch
          ref={field.ref}
          layout="row"
          label="Sync as environment variables"
          description="When off, values are written as environment secrets and hidden in Qovery."
          checked={field.value === QoveryVariableType.Variable}
          onCheckedChange={(checked) =>
            field.onChange(checked ? QoveryVariableType.Variable : QoveryVariableType.Secret)
          }
        />
      )}
    />
  );
}

const qoveryReview = (config: FieldValues): ReviewItems => [
  ["Organization", config.organizationName],
  ["Project", config.projectName],
  ["Scope", config.environmentId ? `Environment (${config.environmentName})` : "Project"],
  [
    "Variable type",
    config.variableType === QoveryVariableType.Variable
      ? "Environment variable"
      : "Environment secret"
  ]
];

export const DEPLOY_SYNC_VIEWS: Record<
  | SecretSync.TerraformCloud
  | SecretSync.OctopusDeploy
  | SecretSync.Spacelift
  | SecretSync.Humanitec
  | SecretSync.Northflank
  | SecretSync.Qovery,
  SyncView
> = {
  [SecretSync.TerraformCloud]: {
    Destination: TerraformCloudDestination,
    defaults: {
      destinationConfig: {
        org: "",
        scope: TerraformCloudSyncScope.VariableSet,
        category: TerraformCloudSyncCategory.Environment,
        variableSetId: "",
        variableSetName: "",
        workspaceId: "",
        workspaceName: ""
      }
    },
    destinationReview: terraformCloudReview
  },
  [SecretSync.OctopusDeploy]: {
    Destination: OctopusDeployDestination,
    defaults: {
      destinationConfig: {
        spaceId: "",
        spaceName: "",
        scope: OctopusDeploySyncScope.Project,
        projectId: "",
        projectName: "",
        scopeValues: EMPTY_OCTOPUS_SCOPE_VALUES
      }
    },
    destinationReview: octopusDeployReview
  },
  [SecretSync.Spacelift]: {
    Destination: SpaceliftDestination,
    Options: SpaceliftOptions,
    defaults: {
      destinationConfig: {
        contextId: "",
        contextName: "",
        configType: SpaceliftConfigType.EnvironmentVariable,
        mountPath: ""
      },
      syncOptions: { writeOnly: false }
    },
    destinationReview: spaceliftReview,
    optionsReview: (options) => [["Mark as secret", enabledBadge(options.writeOnly)]]
  },
  [SecretSync.Humanitec]: {
    Destination: HumanitecDestination,
    defaults: {
      destinationConfig: { scope: HumanitecSyncScope.Application, org: "", app: "", env: "" }
    },
    destinationReview: humanitecReview
  },
  [SecretSync.Northflank]: {
    Destination: NorthflankDestination,
    defaults: {
      destinationConfig: {
        projectId: "",
        projectName: "",
        secretGroupId: "",
        secretGroupName: ""
      }
    },
    destinationReview: northflankReview
  },
  [SecretSync.Qovery]: {
    Destination: QoveryDestination,
    Options: QoveryOptions,
    defaults: {
      destinationConfig: {
        organizationId: "",
        organizationName: "",
        projectId: "",
        projectName: "",
        environmentId: "",
        environmentName: "",
        variableType: QoveryVariableType.Secret
      }
    },
    destinationReview: qoveryReview
  }
};
