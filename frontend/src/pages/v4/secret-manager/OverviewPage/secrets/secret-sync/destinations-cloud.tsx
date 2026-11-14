import { use, useEffect, useState } from "react";
import { Controller, type FieldValues, useWatch } from "react-hook-form";
import { Alert } from "@infisical/cipher/ui/alert";
import { Combobox, type ComboboxOption } from "@infisical/cipher/ui/combobox";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import {
  CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS,
  CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS,
  CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS
} from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { CloudflarePagesVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";
import { CloudflareSecretsStoreScope } from "@app/hooks/api/secretSyncs/types/cloudflare-secrets-store-sync";
import { CloudflareWorkersVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";
import { useDebounce } from "@app/hooks/useDebounce";

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
  SyncConnections,
  SyncField,
  type SyncView,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useSyncForm
} from "./sync-fields";

const OCID_TAIL = 6;

const truncatedOcid = (value: unknown, head: number) => {
  const ocid = String(value ?? "");
  if (ocid.length <= head + OCID_TAIL) return ocid;
  return <span title={ocid}>{`${ocid.slice(0, head)}...${ocid.slice(-OCID_TAIL)}`}</span>;
};

function AzureAppConfigurationDestination() {
  const { setValue } = useSyncForm();
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.configurationUrl", "")} />
      <TextField
        name="destinationConfig.configurationUrl"
        label="Configuration URL"
        placeholder="https://resource-name-here.azconfig.io"
      />
      <TextField
        name="destinationConfig.label"
        label="Label"
        optional
        placeholder="infisical-secret"
      />
    </Stack>
  );
}

function AzureDevOpsDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useAzureDevOpsProjects);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.devopsProjectId", "");
          setValue("destinationConfig.devopsProjectName", "");
        }}
      />
      <ComboField
        name="destinationConfig.devopsProjectId"
        label="Project"
        tooltip="The project must exist in the connection's Azure DevOps instance URL."
        options={projects.map((project) => ({
          value: project.appId,
          label: project.name,
          meta: project.id
        }))}
        placeholder="Select a project..."
        emptyText="No projects found."
        onSelect={(appId) =>
          setValue(
            "destinationConfig.devopsProjectName",
            projects.find((project) => project.appId === appId)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

function AzureEntraIdScimDestination() {
  const { control, setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const displayName = useWatch({
    control,
    name: "destinationConfig.servicePrincipalDisplayName"
  }) as string | undefined;
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const principals = useV4Adapter("secrets").useAzureScimServicePrincipals(
    { connectionId: connectionId ?? "", search: debouncedSearch || undefined },
    { enabled: Boolean(connectionId) }
  );
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.servicePrincipalId", "");
          setValue("destinationConfig.servicePrincipalDisplayName", undefined);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.servicePrincipalId"
        render={({ field, fieldState: { error } }) => {
          const options: ComboboxOption[] = (principals.data ?? []).map((principal) => ({
            value: principal.id,
            label: principal.displayName
          }));
          if (field.value && !options.some((option) => option.value === field.value))
            options.unshift({ value: field.value, label: displayName || field.value });
          return (
            <SyncField
              label="SCIM service principal"
              tooltip="The Enterprise Application with SCIM provisioning configured."
              error={error?.message}
            >
              <Combobox
                label="SCIM service principal"
                value={field.value ?? ""}
                onValueChange={(id) => {
                  const selected = principals.data?.find((principal) => principal.id === id);
                  if (!selected || id === field.value) return;
                  field.onChange(id);
                  setValue("destinationConfig.servicePrincipalDisplayName", selected.displayName);
                }}
                onSearch={setSearch}
                options={options}
                loading={principals.isPending && Boolean(connectionId)}
                placeholder="Search for a SCIM service principal..."
                emptyText={
                  debouncedSearch
                    ? "No matching service principals found."
                    : "Type to search for service principals."
                }
                disabled={!connectionId}
                invalid={Boolean(error)}
              />
            </SyncField>
          );
        }}
      />
    </Stack>
  );
}

function AzureEntraIdScimSource() {
  const { control, setValue } = useSyncForm();
  const { projectId } = use(SyncConnections);
  const [environment, secretPath, secretKey, secretId] = useWatch({
    control,
    name: ["environment", "secretPath", "syncOptions.secretKey", "syncOptions.secretId"]
  }) as [{ slug: string } | undefined, string | undefined, string | undefined, string | undefined];
  const ready = Boolean(environment?.slug && secretPath);
  const secrets =
    useV4Adapter("secrets").useSecretsAt({
      projectId,
      environment: environment?.slug ?? "",
      secretPath: secretPath ?? "/",
      viewSecretValue: false,
      options: { enabled: ready }
    }).data ?? [];

  useEffect(() => {
    if (!secretId || secretKey) return;
    const match = secrets.find((secret) => secret.id === secretId);
    if (match) setValue("syncOptions.secretKey", match.key);
  }, [secretId, secretKey, secrets, setValue]);

  return (
    <ComboField
      name="syncOptions.secretKey"
      label="Secret"
      tooltip="The secret whose value is used as the SCIM provisioning token."
      options={secrets.map((secret) => ({ value: secret.key, label: secret.key }))}
      placeholder="Select a secret..."
      emptyText="No secrets found."
      requiresConnection={false}
      disabled={!ready}
      mono
    />
  );
}

function OciVaultDestination() {
  const { control, setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const [compartmentOcid, vaultOcid] = useWatch({
    control,
    name: ["destinationConfig.compartmentOcid", "destinationConfig.vaultOcid"]
  }) as [string | undefined, string | undefined];
  const adapter = useV4Adapter("secrets");
  const compartments = useConnectionOptions(adapter.useOciCompartments);
  const vaults =
    adapter.useOciVaults(
      { connectionId: connectionId ?? "", compartmentOcid: compartmentOcid ?? "" },
      { enabled: Boolean(connectionId && compartmentOcid) }
    ).data ?? [];
  const keys =
    adapter.useOciVaultKeys(
      {
        connectionId: connectionId ?? "",
        compartmentOcid: compartmentOcid ?? "",
        vaultOcid: vaultOcid ?? ""
      },
      { enabled: Boolean(connectionId && compartmentOcid && vaultOcid) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.compartmentOcid", "");
          setValue("destinationConfig.vaultOcid", "");
          setValue("destinationConfig.keyOcid", "");
        }}
      />
      <ComboField
        name="destinationConfig.compartmentOcid"
        label="Compartment"
        tooltip="The connection needs permission to view the compartment."
        options={compartments.map((compartment) => ({
          value: compartment.id,
          label: compartment.name,
          meta: compartment.id
        }))}
        placeholder="Select a compartment..."
        emptyText="No compartments found."
        onSelect={() => {
          setValue("destinationConfig.vaultOcid", "");
          setValue("destinationConfig.keyOcid", "");
        }}
      />
      <ComboField
        name="destinationConfig.vaultOcid"
        label="Vault"
        tooltip="Must be in the selected compartment, and the connection needs permission to view it."
        options={vaults.map((vault) => ({
          value: vault.id,
          label: vault.displayName,
          meta: vault.id
        }))}
        placeholder="Select a vault..."
        emptyText="No vaults found."
        disabled={!compartmentOcid}
        onSelect={() => setValue("destinationConfig.keyOcid", "")}
      />
      <ComboField
        name="destinationConfig.keyOcid"
        label="Encryption key"
        tooltip="Must be in the selected vault, and the connection needs permission to view it."
        options={keys.map((key) => ({
          value: key.id,
          label: key.displayName,
          meta: key.id
        }))}
        placeholder="Select a key..."
        emptyText="No keys found."
        disabled={!compartmentOcid || !vaultOcid}
      />
    </Stack>
  );
}

function DigitalOceanAppPlatformDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const apps = useConnectionOptions(adapter.useDigitalOceanApps);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.appId", "");
          setValue("destinationConfig.appName", "");
        }}
      />
      <ComboField
        name="destinationConfig.appId"
        label="App"
        options={apps.map((app) => ({ value: app.id, label: app.spec.name, meta: app.id }))}
        placeholder="Select an app..."
        emptyText="No apps found."
        onSelect={(id) =>
          setValue("destinationConfig.appName", apps.find((app) => app.id === id)?.spec.name ?? "")
        }
      />
    </Stack>
  );
}

const CLOUDFLARE_PAGES_ENVIRONMENTS = [
  { value: "preview", label: "Preview" },
  { value: "production", label: "Production" }
];

function CloudflarePagesDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useCloudflarePagesProjects);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environment", "preview");
        }}
      />
      <ComboField
        name="destinationConfig.projectName"
        label="Project"
        options={projects.map((project) => ({
          value: project.name,
          label: project.name,
          meta: project.id
        }))}
        placeholder="Select a project..."
        emptyText="No projects found."
      />
      <SelectField
        name="destinationConfig.environment"
        label="Environment"
        placeholder="Select an environment..."
        options={CLOUDFLARE_PAGES_ENVIRONMENTS}
      />
    </Stack>
  );
}

function VariableTypeField({
  options,
  fallback,
  description,
  onSelect
}: {
  options: { value: string; label: string }[];
  fallback: string;
  description: string;
  onSelect?: (value: string) => void;
}) {
  const { control } = useSyncForm();
  return (
    <Controller
      control={control}
      name="destinationConfig.variableType"
      render={({ field, fieldState: { error } }) => (
        <SyncField label="Variable type" description={description} error={error?.message}>
          <Select
            value={field.value ?? fallback}
            onValueChange={(value) => {
              field.onChange(value);
              onSelect?.(value);
            }}
            options={options}
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}

const PAGES_VARIABLE_TYPES = Object.values(CloudflarePagesVariableType).map((value) => ({
  value,
  label: CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS[value]
}));

const WORKERS_VARIABLE_TYPES = Object.values(CloudflareWorkersVariableType).map((value) => ({
  value,
  label: CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS[value]
}));

function CloudflarePagesOptions() {
  return (
    <VariableTypeField
      options={PAGES_VARIABLE_TYPES}
      fallback={CloudflarePagesVariableType.Secret}
      description="Secrets are encrypted in Cloudflare, while text variables stay readable."
    />
  );
}

function CloudflareWorkersDestination() {
  const { setValue } = useSyncForm();
  const adapter = useV4Adapter("secrets");
  const scripts = useConnectionOptions(adapter.useCloudflareWorkersScripts);
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.scriptId", "")} />
      <ComboField
        name="destinationConfig.scriptId"
        label="Worker script"
        options={scripts.map((script) => ({ value: script.id, label: script.id }))}
        placeholder="Select a worker script..."
        emptyText="No worker scripts found."
        mono
      />
    </Stack>
  );
}

function CloudflareWorkersOptions() {
  const { control, setValue } = useSyncForm();
  const [variableType, syncNonSecretBindings, disableSecretDeletion] = useWatch({
    control,
    name: [
      "destinationConfig.variableType",
      "syncOptions.syncNonSecretBindings",
      "syncOptions.disableSecretDeletion"
    ]
  }) as [string | undefined, boolean | undefined, boolean | undefined];
  const isSecret =
    (variableType ?? CloudflareWorkersVariableType.Secret) === CloudflareWorkersVariableType.Secret;
  return (
    <Stack gap={16}>
      <VariableTypeField
        options={WORKERS_VARIABLE_TYPES}
        fallback={CloudflareWorkersVariableType.Secret}
        description="Secrets are encrypted in Cloudflare, while text and JSON variables stay readable."
        onSelect={(value) => {
          if (value !== CloudflareWorkersVariableType.Secret)
            setValue("syncOptions.syncNonSecretBindings", false);
        }}
      />
      {isSecret && (
        <>
          <SwitchField
            name="syncOptions.syncNonSecretBindings"
            label="Sync plaintext and JSON variables"
            description="Update existing plaintext and JSON variables as they are, instead of failing the sync on them."
          />
          {syncNonSecretBindings && !disableSecretDeletion && (
            <Alert tone="warn" title="Plaintext and JSON variables may be deleted">
              With secret deletion allowed, plaintext and JSON variables in Cloudflare Workers that
              are not in Infisical are removed during a sync. Turn on Prevent secret deletion to
              keep them.
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
}

function CloudflareSecretsStoreDestination() {
  const { setValue } = useSyncForm();
  const connectionId = useConnectionId();
  const stores = useV4Adapter("secrets").useCloudflareSecretsStores(connectionId ?? "", {
    enabled: Boolean(connectionId)
  });
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.storeId", "");
          setValue("destinationConfig.storeName", "");
        }}
      />
      <ComboField
        name="destinationConfig.storeId"
        label="Secrets store"
        options={(stores.data ?? []).map((store) => ({
          value: store.id,
          label: store.name,
          meta: store.id
        }))}
        placeholder="Select a store..."
        emptyText={
          stores.error
            ? "Couldn't load Secrets Stores. Check that the connection's API token has the Secrets Store Edit permission."
            : "No stores found."
        }
        onSelect={(id) =>
          setValue(
            "destinationConfig.storeName",
            stores.data?.find((store) => store.id === id)?.name ?? ""
          )
        }
      />
      <MultiComboField
        name="destinationConfig.scopes"
        label="Scopes"
        options={Object.values(CloudflareSecretsStoreScope).map((scope) => ({
          value: scope,
          label: CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS[scope]
        }))}
        placeholder="Select scopes..."
        requiresConnection={false}
      />
    </Stack>
  );
}

const variableTypeReview = (
  types: { value: string; label: string }[],
  fallback: string,
  config: FieldValues
) => ["Variable type", labelFor(types, config.variableType ?? fallback)] as const;

const cloudflareWorkersOptionsReview = (options: FieldValues): ReviewItems =>
  options.syncNonSecretBindings ? [["Sync plaintext and JSON variables", enabledBadge(true)]] : [];

export const CLOUD_SYNC_VIEWS: Record<
  | SecretSync.AzureAppConfiguration
  | SecretSync.AzureDevOps
  | SecretSync.AzureEntraIdScim
  | SecretSync.OCIVault
  | SecretSync.DigitalOceanAppPlatform
  | SecretSync.CloudflarePages
  | SecretSync.CloudflareWorkers
  | SecretSync.CloudflareSecretsStore,
  SyncView
> = {
  [SecretSync.AzureAppConfiguration]: {
    Destination: AzureAppConfigurationDestination,
    defaults: { destinationConfig: { configurationUrl: "", label: "" } },
    destinationReview: (config) => [
      ["Configuration URL", config.configurationUrl],
      ["Label", config.label]
    ]
  },
  [SecretSync.AzureDevOps]: {
    Destination: AzureDevOpsDestination,
    defaults: { destinationConfig: { devopsProjectId: "", devopsProjectName: "" } },
    destinationReview: (config) => [
      [
        config.devopsProjectName ? "Project" : "Project ID",
        config.devopsProjectName || config.devopsProjectId
      ]
    ]
  },
  [SecretSync.AzureEntraIdScim]: {
    Destination: AzureEntraIdScimDestination,
    Source: AzureEntraIdScimSource,
    defaults: {
      destinationConfig: { servicePrincipalId: "" },
      syncOptions: { secretKey: "" }
    },
    destinationReview: (config) => [
      ["SCIM service principal", config.servicePrincipalDisplayName || config.servicePrincipalId]
    ]
  },
  [SecretSync.OCIVault]: {
    Destination: OciVaultDestination,
    defaults: { destinationConfig: { compartmentOcid: "", vaultOcid: "", keyOcid: "" } },
    destinationReview: (config) => [
      ["Compartment OCID", truncatedOcid(config.compartmentOcid, 21)],
      ["Vault OCID", truncatedOcid(config.vaultOcid, 15)],
      ["Key OCID", truncatedOcid(config.keyOcid, 13)]
    ]
  },
  [SecretSync.DigitalOceanAppPlatform]: {
    Destination: DigitalOceanAppPlatformDestination,
    defaults: { destinationConfig: { appId: "", appName: "" } },
    destinationReview: (config) => [["App", config.appName]]
  },
  [SecretSync.CloudflarePages]: {
    Destination: CloudflarePagesDestination,
    Options: CloudflarePagesOptions,
    defaults: { destinationConfig: { projectName: "", environment: "preview" } },
    destinationReview: (config) => [
      ["Project", config.projectName],
      ["Environment", labelFor(CLOUDFLARE_PAGES_ENVIRONMENTS, config.environment)],
      variableTypeReview(PAGES_VARIABLE_TYPES, CloudflarePagesVariableType.Secret, config)
    ]
  },
  [SecretSync.CloudflareWorkers]: {
    Destination: CloudflareWorkersDestination,
    Options: CloudflareWorkersOptions,
    defaults: {
      destinationConfig: { scriptId: "" },
      syncOptions: { syncNonSecretBindings: false }
    },
    destinationReview: (config) => [
      ["Script", config.scriptId],
      variableTypeReview(WORKERS_VARIABLE_TYPES, CloudflareWorkersVariableType.Secret, config)
    ],
    optionsReview: cloudflareWorkersOptionsReview
  },
  [SecretSync.CloudflareSecretsStore]: {
    Destination: CloudflareSecretsStoreDestination,
    defaults: {
      destinationConfig: {
        storeId: "",
        storeName: "",
        scopes: [CloudflareSecretsStoreScope.Workers]
      }
    },
    destinationReview: (config) => [
      ["Secrets store", config.storeName || config.storeId],
      [
        "Scopes",
        (config.scopes as CloudflareSecretsStoreScope[] | undefined)
          ?.map((scope) => CLOUDFLARE_SECRETS_STORE_SCOPE_LABELS[scope])
          .join(", ")
      ]
    ]
  }
};
