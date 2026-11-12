import { Controller, useWatch } from "react-hook-form";

import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { ZabbixMacroType, ZabbixSyncScope } from "@app/hooks/api/appConnections/zabbix/types";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ComboField,
  ConnectionField,
  labelFor,
  type SyncView,
  SyncField,
  useConnectionOptions,
  useSyncForm
} from "./sync-fields";

const ZABBIX_SCOPES = [
  { value: ZabbixSyncScope.Host, label: "Host" },
  { value: ZabbixSyncScope.Global, label: "Global" }
];

const ZABBIX_MACRO_TYPES = [
  { value: String(ZabbixMacroType.Text), label: "Text" },
  { value: String(ZabbixMacroType.Secret), label: "Secret" }
];

function DatabricksDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const scopes = useConnectionOptions(adapter.useDatabricksSecretScopes);
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.scope", "")} />
      <ComboField
        name="destinationConfig.scope"
        label="Secret scope"
        tooltip="Use a dedicated scope so Infisical doesn't remove secrets it doesn't manage. The service principal needs write permission on it."
        options={scopes.map((scope) => ({ value: scope.name, label: scope.name }))}
        placeholder="Select a secret scope..."
      />
    </Stack>
  );
}

function SnowflakeDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, database] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.database"]
  }) as [string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const databases = useConnectionOptions(adapter.useSnowflakeDatabases);
  const schemas =
    adapter.useSnowflakeSchemas(
      { connectionId: connectionId ?? "", database: database ?? "" },
      { enabled: Boolean(connectionId && database) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.database", "");
          setValue("destinationConfig.schema", "");
        }}
      />
      <ComboField
        name="destinationConfig.database"
        label="Database"
        tooltip="Must already exist."
        options={databases.map((entry) => ({ value: entry.name, label: entry.name }))}
        placeholder="Select a database..."
        onSelect={() => setValue("destinationConfig.schema", "")}
      />
      <ComboField
        name="destinationConfig.schema"
        label="Schema"
        tooltip="Must already exist in the selected database."
        options={(database ? schemas : []).map((entry) => ({
          value: entry.name,
          label: entry.name
        }))}
        placeholder="Select a schema..."
        disabled={!database}
      />
    </Stack>
  );
}

function SupabaseDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useSupabaseProjects);
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
        label="Project"
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

function HasuraCloudDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useHasuraCloudProjects);
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
        label="Project"
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

function CamundaDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const clusters = useConnectionOptions(adapter.useCamundaClusters);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.clusterUUID", "");
          setValue("destinationConfig.clusterName", "");
        }}
      />
      <ComboField
        name="destinationConfig.clusterUUID"
        label="Cluster"
        tooltip="The credential must have access to the cluster."
        options={clusters.map((cluster) => ({
          value: cluster.uuid,
          label: cluster.name,
          meta: cluster.uuid
        }))}
        placeholder="Select a cluster..."
        onSelect={(uuid) =>
          setValue(
            "destinationConfig.clusterName",
            clusters.find((cluster) => cluster.uuid === uuid)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

function ZabbixDestination() {
  const { control, setValue } = useSyncForm();
  const scope = useWatch({ control, name: "destinationConfig.scope" }) as string | undefined;
  const adapter = useV4Adapter("secrets");
  const hosts = useConnectionOptions(adapter.useZabbixHosts);
  const resetHost = () => {
    setValue("destinationConfig.hostId", "");
    setValue("destinationConfig.hostName", "");
  };
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", ZabbixSyncScope.Global);
          resetHost();
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.scope"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Scope"
            tooltip="Host syncs macros to one host. Global syncs them as global macros."
            error={error?.message}
          >
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                resetHost();
              }}
              options={ZABBIX_SCOPES}
              placeholder="Select a scope..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      {scope === ZabbixSyncScope.Host && (
        <ComboField
          name="destinationConfig.hostId"
          label="Host"
          options={hosts.map((host) => ({
            value: host.hostId,
            label: host.host,
            meta: host.hostId
          }))}
          placeholder="Select a host..."
          onSelect={(hostId) =>
            setValue(
              "destinationConfig.hostName",
              hosts.find((host) => host.hostId === hostId)?.host ?? ""
            )
          }
        />
      )}
      <Controller
        control={control}
        name="destinationConfig.macroType"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Macro type" error={error?.message}>
            <Select
              value={String(field.value ?? "")}
              onValueChange={(value) => field.onChange(Number.parseInt(value, 10))}
              options={ZABBIX_MACRO_TYPES}
              placeholder="Select a macro type..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
    </Stack>
  );
}

export const DATA_SYNC_VIEWS: Record<
  | SecretSync.Databricks
  | SecretSync.Snowflake
  | SecretSync.Supabase
  | SecretSync.HasuraCloud
  | SecretSync.Camunda
  | SecretSync.Zabbix,
  SyncView
> = {
  [SecretSync.Databricks]: {
    Destination: DatabricksDestination,
    defaults: { destinationConfig: { scope: "" } },
    destinationReview: (config) => [["Secret scope", config.scope]]
  },
  [SecretSync.Snowflake]: {
    Destination: SnowflakeDestination,
    defaults: { destinationConfig: { database: "", schema: "" } },
    destinationReview: (config) => [
      ["Database", config.database],
      ["Schema", config.schema]
    ]
  },
  [SecretSync.Supabase]: {
    Destination: SupabaseDestination,
    defaults: { destinationConfig: { projectId: "", projectName: "" } },
    destinationReview: (config) => [["Project", config.projectName || config.projectId]]
  },
  [SecretSync.HasuraCloud]: {
    Destination: HasuraCloudDestination,
    defaults: { destinationConfig: { projectId: "", projectName: "" } },
    destinationReview: (config) => [["Project", config.projectName || config.projectId]]
  },
  [SecretSync.Camunda]: {
    Destination: CamundaDestination,
    defaults: { destinationConfig: { scope: "cluster", clusterUUID: "", clusterName: "" } },
    destinationReview: (config) => [
      [
        "Cluster",
        config.clusterName ? `${config.clusterName} (${config.clusterUUID})` : config.clusterUUID
      ]
    ]
  },
  [SecretSync.Zabbix]: {
    Destination: ZabbixDestination,
    defaults: {
      destinationConfig: { scope: ZabbixSyncScope.Global, macroType: ZabbixMacroType.Secret }
    },
    destinationReview: (config) => [
      ["Scope", labelFor(ZABBIX_SCOPES, config.scope)],
      ...(config.scope === ZabbixSyncScope.Host
        ? [["Host name", config.hostName] as const, ["Host ID", config.hostId] as const]
        : []),
      ["Macro type", labelFor(ZABBIX_MACRO_TYPES, String(config.macroType))]
    ]
  }
};
