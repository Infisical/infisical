import { SecretSync, SecretSyncImportBehavior } from "@app/hooks/api/secretSyncs";
import { TAwsParameterStoreSync } from "@app/hooks/api/secretSyncs/types/aws-parameter-store-sync";
import { TGitHubSync } from "@app/hooks/api/secretSyncs/types/github-sync";
import { DiscriminativePick } from "@app/types";

import { TAwsSecretsManagerSync } from "./aws-secrets-manager-sync";
import { TAzureAppConfigurationSync } from "./azure-app-configuration-sync";
import { TAzureKeyVaultSync } from "./azure-key-vault-sync";
import { TGcpSync } from "./gcp-sync";

export type TSecretSyncOption = {
  name: string;
  destination: SecretSync;
  canImportSecrets: boolean;
};

export type TSecretSync =
  | TAwsParameterStoreSync
  | TAwsSecretsManagerSync
  | TGitHubSync
  | TGcpSync
  | TAzureKeyVaultSync
  | TAzureAppConfigurationSync;

export type TListSecretSyncs = { secretSyncs: TSecretSync[] };

export type TListSecretSyncOptions = { secretSyncOptions: TSecretSyncOption[] };
export type TSecretSyncResponse = { secretSync: TSecretSync };

export type TCreateSecretSyncDTO = DiscriminativePick<
  TSecretSync,
  | "name"
  | "destinationConfig"
  | "description"
  | "connectionId"
  | "syncOptions"
  | "destination"
  | "isAutoSyncEnabled"
> & { environment: string; secretPath: string; projectId: string };

export type TUpdateSecretSyncDTO = Partial<
  Omit<TCreateSecretSyncDTO, "destination" | "projectId">
> & {
  destination: SecretSync;
  syncId: string;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
  removeSecrets: boolean;
};

export type TTriggerSecretSyncSyncSecretsDTO = {
  destination: SecretSync;
  syncId: string;
};

export type TTriggerSecretSyncImportSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  importBehavior: SecretSyncImportBehavior;
};

export type TTriggerSecretSyncRemoveSecretsDTO = {
  destination: SecretSync;
  syncId: string;
};
