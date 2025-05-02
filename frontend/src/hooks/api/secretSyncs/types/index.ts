import { SecretSync, SecretSyncImportBehavior } from "@app/hooks/api/secretSyncs";
import { DiscriminativePick } from "@app/types";

import { TAwsParameterStoreSync } from "./aws-parameter-store-sync";
import { TAwsSecretsManagerSync } from "./aws-secrets-manager-sync";
import { TAzureAppConfigurationSync } from "./azure-app-configuration-sync";
import { TAzureKeyVaultSync } from "./azure-key-vault-sync";
import { TCamundaSync } from "./camunda-sync";
import { TDatabricksSync } from "./databricks-sync";
import { TGcpSync } from "./gcp-sync";
import { TGitHubSync } from "./github-sync";
import { THCVaultSync } from "./hc-vault-sync";
import { THumanitecSync } from "./humanitec-sync";
import { TTeamCitySync } from "./teamcity-sync";
import { TTerraformCloudSync } from "./terraform-cloud-sync";
import { TVercelSync } from "./vercel-sync";
import { TWindmillSync } from "./windmill-sync";

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
  | TAzureAppConfigurationSync
  | TDatabricksSync
  | THumanitecSync
  | TTerraformCloudSync
  | TCamundaSync
  | TVercelSync
  | TWindmillSync
  | THCVaultSync
  | TTeamCitySync;

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
  projectId: string;
};

export type TDeleteSecretSyncDTO = {
  destination: SecretSync;
  syncId: string;
  removeSecrets: boolean;
  projectId: string;
};

export type TTriggerSecretSyncSyncSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  projectId: string;
};

export type TTriggerSecretSyncImportSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  importBehavior: SecretSyncImportBehavior;
  projectId: string;
};

export type TTriggerSecretSyncRemoveSecretsDTO = {
  destination: SecretSync;
  syncId: string;
  projectId: string;
};
