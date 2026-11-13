import { useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Stack } from "@infisical/cipher/ui/layout";
import { SecretPathInput } from "@infisical/cipher/ui/secret-path-input";

import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { useV4Adapter } from "../../../../data/adapters";
import {
  ComboField,
  ConnectionField,
  SwitchField,
  SyncField,
  type SyncView,
  TextField,
  useConnectionOptions,
  useSyncForm,
  yesNo
} from "./sync-fields";

function HCVaultDestination() {
  const { setValue } = useSyncForm();
  const mounts = useConnectionOptions(useV4Adapter("secrets").useHCVaultMounts);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.mount", "");
          setValue("destinationConfig.path", "");
        }}
      />
      <ComboField
        name="destinationConfig.mount"
        label="Secrets engine mount"
        tooltip="Supports KV engines version 1 and 2. On HCP Vault, set the namespace on the connection."
        options={mounts.map((mount) => ({ value: mount, label: mount }))}
        placeholder="Select a secrets engine mount..."
      />
      <TextField
        name="destinationConfig.path"
        label="Path"
        tooltip="Created if it doesn't exist."
        placeholder="dev/example"
      />
    </Stack>
  );
}

function OnePassDestination() {
  const { setValue } = useSyncForm();
  const vaults = useConnectionOptions(useV4Adapter("secrets").useOnePassVaults);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.vaultId", "");
          setValue("destinationConfig.valueLabel", "");
        }}
      />
      <ComboField
        name="destinationConfig.vaultId"
        label="Vault"
        tooltip="The vault must exist at the connection's 1Password instance URL."
        options={vaults.map((vault) => ({ value: vault.id, label: vault.name, meta: vault.id }))}
        placeholder="Select a vault..."
      />
      <TextField
        name="destinationConfig.valueLabel"
        label="Value label"
        optional
        tooltip="The label of the item field that holds the secret value. Defaults to value."
        placeholder="value"
      />
    </Stack>
  );
}

function KeeperDestination() {
  const { setValue } = useSyncForm();
  const folders = useConnectionOptions(useV4Adapter("secrets").useKeeperSharedFolders);
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.folderUid", "");
          setValue("destinationConfig.folderName", "");
        }}
      />
      <ComboField
        name="destinationConfig.folderUid"
        label="Shared folder"
        tooltip="Secrets sync as login records: the record title is the secret key and the password field is the value."
        options={folders.map((folder) => ({
          value: folder.uid,
          label: folder.name,
          meta: folder.uid
        }))}
        placeholder="Select a shared folder..."
        onSelect={(uid) =>
          setValue(
            "destinationConfig.folderName",
            folders.find((folder) => folder.uid === uid)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

function ExternalInfisicalDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, projectId, environment] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.projectId", "destinationConfig.environment"]
  }) as [string | undefined, string, string];
  const [parentPath, setParentPath] = useState("/");
  const adapter = useV4Adapter("secrets");
  const projects = useConnectionOptions(adapter.useExternalInfisicalProjects);
  const tree =
    adapter.useExternalInfisicalFolderTree(
      { connectionId: connectionId ?? "", projectId: projectId ?? "" },
      { enabled: Boolean(connectionId && projectId) }
    ).data ?? {};
  const environments = projects.find((project) => project.id === projectId)?.environments ?? [];
  const browsedPath = parentPath === "/" ? "/" : `${parentPath}/`;
  const folderNames = environment
    ? (
        (tree[environment] ?? Object.values(tree).find((entry) => entry.slug === environment))
          ?.folders ?? []
      )
        .filter((folder) => {
          if (!folder.path.startsWith(browsedPath)) return false;
          const remainder = folder.path.slice(browsedPath.length);
          return remainder.length > 0 && !remainder.includes("/");
        })
        .map((folder) => folder.name)
    : [];
  const resetPath = () => setValue("destinationConfig.secretPath", "/");
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.environment", "");
          resetPath();
        }}
      />
      <ComboField
        name="destinationConfig.projectId"
        label="Project"
        tooltip="The connection's machine identity must have access to the project."
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
          meta: project.slug
        }))}
        placeholder="Select a project..."
        onSelect={() => {
          setValue("destinationConfig.environment", "");
          resetPath();
        }}
      />
      <ComboField
        name="destinationConfig.environment"
        label="Environment"
        options={environments.map((entry) => ({
          value: entry.slug,
          label: entry.name,
          meta: entry.slug
        }))}
        placeholder="Select an environment..."
        disabled={!projectId}
        onSelect={resetPath}
      />
      <Controller
        control={control}
        name="destinationConfig.secretPath"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Secret path" error={error?.message}>
            <SecretPathInput
              ref={field.ref}
              value={field.value ?? "/"}
              onChange={field.onChange}
              onBlur={field.onBlur}
              folders={folderNames}
              onParentPathChange={setParentPath}
              placeholder="/"
              disabled={!connectionId || !projectId || !environment}
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
    </Stack>
  );
}

function OvhDestination() {
  const { setValue } = useSyncForm();
  return (
    <Stack gap={16}>
      <ConnectionField onChange={() => setValue("destinationConfig.path", "")} />
      <TextField
        name="destinationConfig.path"
        label="Path"
        tooltip="Secrets are stored as key/value pairs at this path in OVHcloud KMS. Created if it doesn't exist."
        placeholder="app/production"
      />
    </Stack>
  );
}

function ChefDestination() {
  const { control, setValue } = useSyncForm();
  const [connectionId, dataBagName] = useWatch({
    control,
    name: ["connection.id", "destinationConfig.dataBagName"]
  }) as [string | undefined, string];
  const adapter = useV4Adapter("secrets");
  const dataBags = useConnectionOptions(adapter.useChefDataBags);
  const dataBagItems =
    adapter.useChefDataBagItems(
      { connectionId: connectionId ?? "", dataBagName: dataBagName ?? "" },
      { enabled: Boolean(connectionId && dataBagName) }
    ).data ?? [];
  return (
    <Stack gap={16}>
      <ConnectionField
        onChange={() => {
          setValue("destinationConfig.dataBagName", "");
          setValue("destinationConfig.dataBagItemName", "");
        }}
      />
      <ComboField
        name="destinationConfig.dataBagName"
        label="Data bag"
        options={dataBags.map((bag) => ({ value: bag.name, label: bag.name }))}
        placeholder="Select a data bag..."
        onSelect={() => setValue("destinationConfig.dataBagItemName", "")}
      />
      <ComboField
        name="destinationConfig.dataBagItemName"
        label="Data bag item"
        options={dataBagItems.map((item) => ({ value: item.name, label: item.name }))}
        placeholder="Select a data bag item..."
        disabled={!dataBagName}
      />
      <SwitchField
        name="destinationConfig.shouldEncryptSecrets"
        label="Encrypt secrets"
        description="Writes an encrypted data bag item. Add your data bag secret to the connection first, and copy it to every node that reads the item."
      />
    </Stack>
  );
}

export const VAULTS_SYNC_VIEWS: Record<
  | SecretSync.HCVault
  | SecretSync.OnePass
  | SecretSync.Keeper
  | SecretSync.ExternalInfisical
  | SecretSync.OVH
  | SecretSync.Chef,
  SyncView
> = {
  [SecretSync.HCVault]: {
    Destination: HCVaultDestination,
    defaults: { destinationConfig: { mount: "", path: "" } },
    destinationReview: (config) => [
      ["Secrets engine mount", config.mount],
      ["Path", config.path]
    ]
  },
  [SecretSync.OnePass]: {
    Destination: OnePassDestination,
    defaults: { destinationConfig: { vaultId: "", valueLabel: "" } },
    destinationReview: (config) => [
      ["Vault ID", config.vaultId],
      ["Value key", config.valueLabel || "value"]
    ]
  },
  [SecretSync.Keeper]: {
    Destination: KeeperDestination,
    defaults: { destinationConfig: { folderUid: "", folderName: "" } },
    destinationReview: (config) => [
      ...(config.folderName ? [["Shared folder", config.folderName] as const] : []),
      ["Shared folder UID", config.folderUid]
    ]
  },
  [SecretSync.ExternalInfisical]: {
    Destination: ExternalInfisicalDestination,
    defaults: { destinationConfig: { projectId: "", environment: "", secretPath: "/" } },
    destinationReview: (config) => [
      ["Project ID", config.projectId],
      ["Environment", config.environment],
      ["Secret path", config.secretPath]
    ]
  },
  [SecretSync.OVH]: {
    Destination: OvhDestination,
    defaults: { destinationConfig: { path: "" } },
    destinationReview: (config) => [["Path", config.path]]
  },
  [SecretSync.Chef]: {
    Destination: ChefDestination,
    defaults: {
      destinationConfig: { dataBagName: "", dataBagItemName: "", shouldEncryptSecrets: false }
    },
    destinationReview: (config) => [
      ["Data bag", config.dataBagName],
      ["Data bag item", config.dataBagItemName],
      ["Encrypt secrets", yesNo(config.shouldEncryptSecrets)]
    ]
  }
};
