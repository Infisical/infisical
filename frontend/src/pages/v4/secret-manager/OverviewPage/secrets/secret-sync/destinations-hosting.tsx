import { type ReactNode } from "react";
import { Controller, type FieldValues, useWatch } from "react-hook-form";

import { Alert } from "@app/components/v4/ui/alert";
import { Combobox, type ComboboxOption } from "@app/components/v4/ui/combobox";
import { Stack } from "@app/components/v4/ui/layout";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { RenderSyncScope, RenderSyncType } from "@app/hooks/api/secretSyncs/types/render-sync";

import { useV4Adapter } from "../../../../data/adapters";
import type { V4QueryResult } from "../../../../data/contract";
import {
  ComboField,
  ConnectionField,
  enabledBadge,
  labelFor,
  type ReviewItems,
  SelectField,
  SwitchField,
  SyncField,
  type SyncView,
  useConnectionId,
  useConnectionOptions,
  useSyncForm
} from "./sync-fields";

const NONE = "__none__";

const NETLIFY_CONTEXTS = [
  { value: "deploy-preview", label: "Deploy preview" },
  { value: "production", label: "Production" },
  { value: "branch-deploy", label: "Branch deploy" },
  { value: "dev", label: "Dev" },
  { value: "branch", label: "Branch" }
];

const RENDER_SCOPES = [
  { value: RenderSyncScope.Service, label: "Service" },
  { value: RenderSyncScope.EnvironmentGroup, label: "Environment group" }
];

function ClearableComboField({
  name,
  label,
  options,
  placeholder,
  clearLabel,
  tooltip,
  description,
  disabled,
  emptyValue,
  onSelect
}: {
  name: string;
  label: string;
  options: readonly ComboboxOption[];
  placeholder: string;
  clearLabel: string;
  tooltip?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  emptyValue?: null | "";
  onSelect?: (value: string | undefined) => void;
}) {
  const { control } = useSyncForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <SyncField
          label={label}
          optional
          tooltip={tooltip}
          description={description}
          error={error?.message}
        >
          <Combobox
            label={label}
            value={field.value ? String(field.value) : NONE}
            onValueChange={(value) => {
              const next = value === NONE ? undefined : value;
              field.onChange(next ?? emptyValue);
              onSelect?.(next);
            }}
            options={[{ value: NONE, label: clearLabel }, ...options]}
            placeholder={placeholder}
            disabled={disabled || !connectionId}
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}

function NameOf({
  lookup,
  id,
  fallback
}: {
  lookup:
    | "useRenderServices"
    | "useRenderEnvironmentGroups"
    | "usePortainerEnvironments"
    | "usePortainerStacks";
  id: string | number;
  fallback: ReactNode;
}) {
  const useList: (
    connectionId: string,
    options?: { enabled?: boolean }
  ) => V4QueryResult<{ id: string | number; name: string }[]> = useV4Adapter("secrets")[lookup];
  return useConnectionOptions(useList).find((item) => item.id === id)?.name ?? fallback;
}

function HerokuDestination() {
  const { setValue } = useSyncForm();
  const apps = useConnectionOptions(useV4Adapter("secrets").useHerokuApps);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.appName", "");
        }}
      />
      <ComboField
        name="destinationConfig.app"
        label="App"
        tooltip="The app must exist in the Heroku instance URL set on the connection."
        options={apps.map((app) => ({ value: app.id, label: app.name, meta: app.id }))}
        placeholder="Select an app..."
        onSelect={(id) =>
          setValue("destinationConfig.appName", apps.find((app) => app.id === id)?.name ?? "")
        }
      />
    </Stack>
  );
}

function NetlifyDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, accountId] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.accountId"]
  }) as [string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const accounts = useConnectionOptions(adapter.useNetlifyAccounts);
  const sites =
    adapter.useNetlifySites(
      { connectionId: connectionId ?? "", accountId: accountId ?? "" },
      { enabled: Boolean(connectionId && accountId) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.accountId", "");
          setValue("destinationConfig.accountName", "");
          setValue("destinationConfig.siteId", "");
          setValue("destinationConfig.siteName", undefined);
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
          setValue("destinationConfig.siteId", "");
          setValue("destinationConfig.siteName", undefined);
        }}
      />
      <ClearableComboField
        name="destinationConfig.siteId"
        label="Site"
        options={sites.map((site) => ({ value: site.id, label: site.name, meta: site.id }))}
        placeholder="Select a site..."
        clearLabel="All sites"
        disabled={!accountId}
        emptyValue=""
        onSelect={(id) =>
          setValue("destinationConfig.siteName", sites.find((site) => site.id === id)?.name)
        }
      />
      <ClearableComboField
        name="destinationConfig.context"
        label="Context"
        options={NETLIFY_CONTEXTS}
        placeholder="Select a context..."
        clearLabel="All contexts"
        description="Syncs with overlapping contexts for the same site can delete each other's secrets. All contexts overlaps with every context."
        disabled={!accountId}
        emptyValue={null}
      />
    </Stack>
  );
}

function RenderDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, scope] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.scope"]
  }) as [string | undefined, RenderSyncScope];
  const adapter = useV4Adapter("secrets");
  const services = useConnectionOptions(adapter.useRenderServices);
  const groups =
    adapter.useRenderEnvironmentGroups(connectionId ?? "", {
      enabled: Boolean(connectionId) && scope === RenderSyncScope.EnvironmentGroup
    }).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.serviceId", "");
          setValue("destinationConfig.serviceName", "");
          setValue("destinationConfig.environmentGroupId", "");
          setValue("destinationConfig.environmentGroupName", "");
          setValue("destinationConfig.type", RenderSyncType.Env);
          setValue("destinationConfig.scope", RenderSyncScope.Service);
        }}
      />
      <SelectField
        name="destinationConfig.scope"
        label="Scope"
        options={RENDER_SCOPES}
        placeholder="Select a scope..."
        defaultValue={RenderSyncScope.Service}
      />
      {scope === RenderSyncScope.Service && (
        <ComboField
          name="destinationConfig.serviceId"
          label="Service"
          options={services.map((service) => ({
            value: service.id,
            label: service.name,
            meta: service.id
          }))}
          placeholder="Select a service..."
          onSelect={(id) =>
            setValue(
              "destinationConfig.serviceName",
              services.find((service) => service.id === id)?.name ?? ""
            )
          }
        />
      )}
      {scope === RenderSyncScope.EnvironmentGroup && (
        <ComboField
          name="destinationConfig.environmentGroupId"
          label="Environment group"
          options={groups.map((group) => ({ value: group.id, label: group.name, meta: group.id }))}
          placeholder="Select an environment group..."
          onSelect={(id) =>
            setValue(
              "destinationConfig.environmentGroupName",
              groups.find((group) => group.id === id)?.name ?? ""
            )
          }
        />
      )}
    </Stack>
  );
}

function RenderOptions() {
  return (
    <SwitchField name="syncOptions.autoRedeployServices" label="Auto-redeploy services on sync" />
  );
}

function RailwayDestination() {
  const { control, setValue } = useSyncForm();
  const projectId = useWatch({ control, name: "destinationConfig.projectId" }) as
    | string
    | undefined;
  const projects = useConnectionOptions(useV4Adapter("secrets").useRailwayProjects);
  const project = projects.find((entry) => entry.id === projectId);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environmentId", "");
          setValue("destinationConfig.environmentName", "");
          setValue("destinationConfig.serviceId", undefined);
          setValue("destinationConfig.serviceName", undefined);
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Project"
        options={projects.map((entry) => ({
          value: entry.id,
          label: entry.name,
          meta: entry.id
        }))}
        placeholder="Select a project..."
        onSelect={(id) => {
          setValue(
            "destinationConfig.projectName",
            projects.find((entry) => entry.id === id)?.name ?? ""
          );
          setValue("destinationConfig.environmentId", "");
          setValue("destinationConfig.environmentName", "");
          setValue("destinationConfig.serviceId", undefined);
          setValue("destinationConfig.serviceName", undefined);
        }}
      />
      <ComboField
        name="destinationConfig.environmentId"
        label="Environment"
        options={(project?.environments ?? []).map((entry) => ({
          value: entry.id,
          label: entry.name
        }))}
        placeholder="Select an environment..."
        disabled={!projectId}
        onSelect={(id) =>
          setValue(
            "destinationConfig.environmentName",
            project?.environments.find((entry) => entry.id === id)?.name ?? ""
          )
        }
      />
      <ClearableComboField
        name="destinationConfig.serviceId"
        label="Service"
        tooltip="Without a service, secrets are created as shared variables in Railway."
        options={(project?.services ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
        placeholder="Select a service..."
        clearLabel="Shared variables"
        disabled={!projectId}
        onSelect={(id) =>
          setValue(
            "destinationConfig.serviceName",
            project?.services.find((entry) => entry.id === id)?.name
          )
        }
      />
    </Stack>
  );
}

function FlyioDestination() {
  const apps = useConnectionOptions(useV4Adapter("secrets").useFlyioApps);
  return (
    <Stack gap={16}>
      <ConnectionField />
      <ComboField
        name="destinationConfig.appId"
        label="App"
        options={apps.map((app) => ({ value: app.id, label: app.name, meta: app.id }))}
        placeholder="Select an app..."
      />
    </Stack>
  );
}

function FlyioOptions() {
  return (
    <SwitchField
      name="syncOptions.autoRedeploy"
      label="Auto-redeploy on secret change"
      description="Restarts all app machines after each sync. The Fly.io dashboard may still show secrets as Staged."
    />
  );
}

function Cloud66Destination() {
  const { setValue } = useSyncForm();
  const stacks = useConnectionOptions(useV4Adapter("secrets").useCloud66Stacks);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.stackId", "");
          setValue("destinationConfig.stackName", "");
        }}
      />
      <ComboField
        name="destinationConfig.stackId"
        label="Stack"
        options={stacks.map((stack) => ({ value: stack.id, label: stack.name, meta: stack.id }))}
        placeholder="Select a stack..."
        onSelect={(id) =>
          setValue(
            "destinationConfig.stackName",
            stacks.find((stack) => stack.id === id)?.name ?? ""
          )
        }
      />
      <Alert tone="warn" title="Hyphens are not supported in keys">
        Cloud 66 does not allow environment variable names containing hyphens (-). Secrets whose
        keys contain a hyphen are skipped during sync.
      </Alert>
    </Stack>
  );
}

function LaravelForgeDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, orgSlug, serverId] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.orgSlug", "destinationConfig.serverId"]
  }) as [string | undefined, string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const organizations = useConnectionOptions(adapter.useLaravelForgeOrganizations);
  const servers =
    adapter.useLaravelForgeServers(
      { connectionId: connectionId ?? "", organizationSlug: orgSlug ?? "" },
      { enabled: Boolean(connectionId && orgSlug) }
    ).data ?? [];
  const sites =
    adapter.useLaravelForgeSites(
      {
        connectionId: connectionId ?? "",
        organizationSlug: orgSlug ?? "",
        serverId: serverId ?? ""
      },
      { enabled: Boolean(connectionId && orgSlug && serverId) }
    ).data ?? [];
  const resetServer = () => {
    setValue("destinationConfig.serverId", "");
    setValue("destinationConfig.serverName", "");
    setValue("destinationConfig.siteId", "");
    setValue("destinationConfig.siteName", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.orgSlug", "");
          setValue("destinationConfig.orgName", "");
          resetServer();
        }}
      />
      <ComboField
        name="destinationConfig.orgSlug"
        label="Organization"
        options={organizations.map((org) => ({ value: org.slug, label: org.name, meta: org.slug }))}
        placeholder="Select an organization..."
        onSelect={(slug) => {
          setValue(
            "destinationConfig.orgName",
            organizations.find((org) => org.slug === slug)?.name ?? ""
          );
          resetServer();
        }}
      />
      <ComboField
        name="destinationConfig.serverId"
        label="Server"
        options={servers.map((server) => ({
          value: server.id,
          label: server.name,
          meta: server.id
        }))}
        placeholder="Select a server..."
        disabled={!orgSlug}
        onSelect={(id) => {
          setValue(
            "destinationConfig.serverName",
            servers.find((server) => server.id === id)?.name ?? ""
          );
          setValue("destinationConfig.siteId", "");
          setValue("destinationConfig.siteName", "");
        }}
      />
      <ComboField
        name="destinationConfig.siteId"
        label="Site"
        options={sites.map((site) => ({ value: site.id, label: site.name, meta: site.id }))}
        placeholder="Select a site..."
        disabled={!orgSlug || !serverId}
        onSelect={(id) =>
          setValue("destinationConfig.siteName", sites.find((site) => site.id === id)?.name ?? "")
        }
      />
    </Stack>
  );
}

function PortainerDestination() {
  const { control, setValue } = useSyncForm();
  const [environmentId, stackId] = useWatch({
    control,
    name: ["destinationConfig.environmentId", "destinationConfig.stackId"]
  }) as [number | undefined, number | undefined];
  const connectionId = useConnectionId();
  const adapter = useV4Adapter("secrets");
  const environments = useConnectionOptions(adapter.usePortainerEnvironments);
  const stacks = useConnectionOptions(adapter.usePortainerStacks).filter(
    (stack) => stack.environmentId === environmentId
  );
  const selectedStack = stacks.find((stack) => stack.id === stackId);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.environmentId", undefined);
          setValue("destinationConfig.stackId", undefined);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.environmentId"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Environment" error={error?.message}>
            <Combobox
              label="Environment"
              value={field.value === undefined ? "" : String(field.value)}
              onValueChange={(value) => {
                if (Number(value) === field.value) return;
                field.onChange(Number(value));
                setValue("destinationConfig.stackId", undefined);
              }}
              options={environments.map((environment) => ({
                value: String(environment.id),
                label: environment.name
              }))}
              placeholder="Select an environment..."
              disabled={!connectionId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      <Controller
        control={control}
        name="destinationConfig.stackId"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Stack"
            error={error?.message}
            description={
              selectedStack &&
              (selectedStack.isGitBased
                ? "Variables are stored on the stack's Git configuration. The running containers are left untouched and the new values apply on the stack's next deployment."
                : "Portainer requires the compose file on every update to a file-based stack, so syncing redeploys it whenever the variables change. Use a Git-backed stack to update variables without a redeploy.")
            }
          >
            <Combobox
              label="Stack"
              value={field.value === undefined ? "" : String(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
              options={stacks.map((stack) => ({ value: String(stack.id), label: stack.name }))}
              placeholder="Select a stack..."
              disabled={!environmentId}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
    </Stack>
  );
}

const renderReview = (config: FieldValues): ReviewItems =>
  config.scope === RenderSyncScope.EnvironmentGroup
    ? [
        [
          "Environment group",
          <NameOf
            lookup="useRenderEnvironmentGroups"
            id={config.environmentGroupId}
            fallback={config.environmentGroupName ?? config.environmentGroupId}
          />
        ]
      ]
    : [
        [
          "Service",
          <NameOf
            lookup="useRenderServices"
            id={config.serviceId}
            fallback={config.serviceName ?? config.serviceId}
          />
        ]
      ];

const portainerReview = (config: FieldValues): ReviewItems => [
  [
    "Environment",
    <NameOf
      lookup="usePortainerEnvironments"
      id={config.environmentId}
      fallback={config.environmentId}
    />
  ],
  ["Stack", <NameOf lookup="usePortainerStacks" id={config.stackId} fallback={config.stackId} />]
];

export const HOSTING_SYNC_VIEWS: Record<
  | SecretSync.Heroku
  | SecretSync.Netlify
  | SecretSync.Render
  | SecretSync.Railway
  | SecretSync.Flyio
  | SecretSync.Cloud66
  | SecretSync.LaravelForge
  | SecretSync.Portainer,
  SyncView
> = {
  [SecretSync.Heroku]: {
    Destination: HerokuDestination,
    defaults: { destinationConfig: { app: "", appName: "" } },
    destinationReview: (config) => [
      ["App name", config.appName],
      ["App ID", config.app]
    ]
  },
  [SecretSync.Netlify]: {
    Destination: NetlifyDestination,
    defaults: { destinationConfig: { accountId: "", accountName: "", siteId: "" } },
    destinationReview: (config) => [
      ["Account", config.accountName || config.accountId],
      ["Site", config.siteName || config.siteId || "All sites"],
      ["Context", labelFor(NETLIFY_CONTEXTS, config.context) || "All contexts"]
    ]
  },
  [SecretSync.Render]: {
    Destination: RenderDestination,
    Options: RenderOptions,
    defaults: {
      destinationConfig: {
        scope: RenderSyncScope.Service,
        type: RenderSyncType.Env,
        serviceId: "",
        environmentGroupId: ""
      },
      syncOptions: { autoRedeployServices: false }
    },
    destinationReview: renderReview,
    optionsReview: (options) => [
      ["Auto-redeploy services on sync", enabledBadge(options.autoRedeployServices)]
    ]
  },
  [SecretSync.Railway]: {
    Destination: RailwayDestination,
    defaults: {
      destinationConfig: {
        projectId: "",
        projectName: "",
        environmentId: "",
        environmentName: ""
      }
    },
    destinationReview: (config) => [
      ["Project", config.projectName],
      ["Environment", config.environmentName],
      ["Service", config.serviceName || "Shared variables"]
    ]
  },
  [SecretSync.Flyio]: {
    Destination: FlyioDestination,
    Options: FlyioOptions,
    defaults: { destinationConfig: { appId: "" }, syncOptions: { autoRedeploy: false } },
    destinationReview: (config) => [["App", config.appId]],
    optionsReview: (options) => [
      ["Auto-redeploy on secret change", enabledBadge(options.autoRedeploy)]
    ]
  },
  [SecretSync.Cloud66]: {
    Destination: Cloud66Destination,
    defaults: { destinationConfig: { stackId: "", stackName: "" } },
    destinationReview: (config) => [
      ["Stack", config.stackName],
      ["Stack ID", config.stackId]
    ]
  },
  [SecretSync.LaravelForge]: {
    Destination: LaravelForgeDestination,
    defaults: {
      destinationConfig: {
        orgSlug: "",
        orgName: "",
        serverId: "",
        serverName: "",
        siteId: "",
        siteName: ""
      }
    },
    destinationReview: (config) => [
      ["Account", config.orgName || config.orgSlug],
      ["Server", config.serverName || config.serverId],
      ["Site", config.siteName || config.siteId]
    ]
  },
  [SecretSync.Portainer]: {
    Destination: PortainerDestination,
    defaults: {},
    destinationReview: portainerReview
  }
};
