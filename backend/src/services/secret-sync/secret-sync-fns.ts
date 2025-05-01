import { AxiosError } from "axios";

import {
  AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  AwsParameterStoreSyncFns
} from "@app/services/secret-sync/aws-parameter-store";
import {
  AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  AwsSecretsManagerSyncFns
} from "@app/services/secret-sync/aws-secrets-manager";
import { DATABRICKS_SYNC_LIST_OPTION, databricksSyncFactory } from "@app/services/secret-sync/databricks";
import { GITHUB_SYNC_LIST_OPTION, GithubSyncFns } from "@app/services/secret-sync/github";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  TSecretMap,
  TSecretSyncListItem,
  TSecretSyncWithCredentials
} from "@app/services/secret-sync/secret-sync-types";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { AZURE_APP_CONFIGURATION_SYNC_LIST_OPTION, azureAppConfigurationSyncFactory } from "./azure-app-configuration";
import { AZURE_KEY_VAULT_SYNC_LIST_OPTION, azureKeyVaultSyncFactory } from "./azure-key-vault";
import { CAMUNDA_SYNC_LIST_OPTION, camundaSyncFactory } from "./camunda";
import { GCP_SYNC_LIST_OPTION } from "./gcp";
import { GcpSyncFns } from "./gcp/gcp-sync-fns";
import { HUMANITEC_SYNC_LIST_OPTION } from "./humanitec";
import { HumanitecSyncFns } from "./humanitec/humanitec-sync-fns";
import { TEAMCITY_SYNC_LIST_OPTION, TeamCitySyncFns } from "./teamcity";
import { TERRAFORM_CLOUD_SYNC_LIST_OPTION, TerraformCloudSyncFns } from "./terraform-cloud";
import { VERCEL_SYNC_LIST_OPTION, VercelSyncFns } from "./vercel";
import { WINDMILL_SYNC_LIST_OPTION, WindmillSyncFns } from "./windmill";

const SECRET_SYNC_LIST_OPTIONS: Record<SecretSync, TSecretSyncListItem> = {
  [SecretSync.AWSParameterStore]: AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  [SecretSync.AWSSecretsManager]: AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  [SecretSync.GitHub]: GITHUB_SYNC_LIST_OPTION,
  [SecretSync.GCPSecretManager]: GCP_SYNC_LIST_OPTION,
  [SecretSync.AzureKeyVault]: AZURE_KEY_VAULT_SYNC_LIST_OPTION,
  [SecretSync.AzureAppConfiguration]: AZURE_APP_CONFIGURATION_SYNC_LIST_OPTION,
  [SecretSync.Databricks]: DATABRICKS_SYNC_LIST_OPTION,
  [SecretSync.Humanitec]: HUMANITEC_SYNC_LIST_OPTION,
  [SecretSync.TerraformCloud]: TERRAFORM_CLOUD_SYNC_LIST_OPTION,
  [SecretSync.Camunda]: CAMUNDA_SYNC_LIST_OPTION,
  [SecretSync.Vercel]: VERCEL_SYNC_LIST_OPTION,
  [SecretSync.Windmill]: WINDMILL_SYNC_LIST_OPTION,
  [SecretSync.TeamCity]: TEAMCITY_SYNC_LIST_OPTION
};

export const listSecretSyncOptions = () => {
  return Object.values(SECRET_SYNC_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

type TSyncSecretDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

// const addAffixes = (secretSync: TSecretSyncWithCredentials, unprocessedSecretMap: TSecretMap) => {
//   let secretMap = { ...unprocessedSecretMap };
//
//   const { appendSuffix, prependPrefix } = secretSync.syncOptions;
//
//   if (appendSuffix || prependPrefix) {
//     secretMap = {};
//     Object.entries(unprocessedSecretMap).forEach(([key, value]) => {
//       secretMap[`${prependPrefix || ""}${key}${appendSuffix || ""}`] = value;
//     });
//   }
//
//   return secretMap;
// };
//
// const stripAffixes = (secretSync: TSecretSyncWithCredentials, unprocessedSecretMap: TSecretMap) => {
//   let secretMap = { ...unprocessedSecretMap };
//
//   const { appendSuffix, prependPrefix } = secretSync.syncOptions;
//
//   if (appendSuffix || prependPrefix) {
//     secretMap = {};
//     Object.entries(unprocessedSecretMap).forEach(([key, value]) => {
//       let processedKey = key;
//
//       if (prependPrefix && processedKey.startsWith(prependPrefix)) {
//         processedKey = processedKey.slice(prependPrefix.length);
//       }
//
//       if (appendSuffix && processedKey.endsWith(appendSuffix)) {
//         processedKey = processedKey.slice(0, -appendSuffix.length);
//       }
//
//       secretMap[processedKey] = value;
//     });
//   }
//
//   return secretMap;
// };

export const SecretSyncFns = {
  syncSecrets: (
    secretSync: TSecretSyncWithCredentials,
    secretMap: TSecretMap,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<void> => {
    // const affixedSecretMap = addAffixes(secretSync, secretMap);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.AWSSecretsManager:
        return AwsSecretsManagerSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.GitHub:
        return GithubSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.GCPSecretManager:
        return GcpSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.AzureKeyVault:
        return azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, secretMap);
      case SecretSync.AzureAppConfiguration:
        return azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, secretMap);
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, secretMap);
      case SecretSync.Humanitec:
        return HumanitecSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.TerraformCloud:
        return TerraformCloudSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.Camunda:
        return camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).syncSecrets(secretSync, secretMap);
      case SecretSync.Vercel:
        return VercelSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.Windmill:
        return WindmillSyncFns.syncSecrets(secretSync, secretMap);
      case SecretSync.TeamCity:
        return TeamCitySyncFns.syncSecrets(secretSync, secretMap);
      default:
        throw new Error(
          `Unhandled sync destination for sync secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  },
  getSecrets: async (
    secretSync: TSecretSyncWithCredentials,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<TSecretMap> => {
    let secretMap: TSecretMap;
    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        secretMap = await AwsParameterStoreSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.AWSSecretsManager:
        secretMap = await AwsSecretsManagerSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.GitHub:
        secretMap = await GithubSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.GCPSecretManager:
        secretMap = await GcpSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.AzureKeyVault:
        secretMap = await azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.AzureAppConfiguration:
        secretMap = await azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
      case SecretSync.Humanitec:
        secretMap = await HumanitecSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.TerraformCloud:
        secretMap = await TerraformCloudSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Camunda:
        secretMap = await camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).getSecrets(secretSync);
        break;
      case SecretSync.Vercel:
        secretMap = await VercelSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.Windmill:
        secretMap = await WindmillSyncFns.getSecrets(secretSync);
        break;
      case SecretSync.TeamCity:
        secretMap = await TeamCitySyncFns.getSecrets(secretSync);
        break;
      default:
        throw new Error(
          `Unhandled sync destination for get secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }

    return secretMap;
    // return stripAffixes(secretSync, secretMap);
  },
  removeSecrets: (
    secretSync: TSecretSyncWithCredentials,
    secretMap: TSecretMap,
    { kmsService, appConnectionDAL }: TSyncSecretDeps
  ): Promise<void> => {
    // const affixedSecretMap = addAffixes(secretSync, secretMap);

    switch (secretSync.destination) {
      case SecretSync.AWSParameterStore:
        return AwsParameterStoreSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.AWSSecretsManager:
        return AwsSecretsManagerSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.GitHub:
        return GithubSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.GCPSecretManager:
        return GcpSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.AzureKeyVault:
        return azureKeyVaultSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, secretMap);
      case SecretSync.AzureAppConfiguration:
        return azureAppConfigurationSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, secretMap);
      case SecretSync.Databricks:
        return databricksSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, secretMap);
      case SecretSync.Humanitec:
        return HumanitecSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.TerraformCloud:
        return TerraformCloudSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.Camunda:
        return camundaSyncFactory({
          appConnectionDAL,
          kmsService
        }).removeSecrets(secretSync, secretMap);
      case SecretSync.Vercel:
        return VercelSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.Windmill:
        return WindmillSyncFns.removeSecrets(secretSync, secretMap);
      case SecretSync.TeamCity:
        return TeamCitySyncFns.removeSecrets(secretSync, secretMap);
      default:
        throw new Error(
          `Unhandled sync destination for remove secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  }
};

const MAX_MESSAGE_LENGTH = 1024;

export const parseSyncErrorMessage = (err: unknown): string => {
  let errorMessage: string;

  if (err instanceof SecretSyncError) {
    errorMessage = JSON.stringify({
      secretKey: err.secretKey,
      error: err.message || parseSyncErrorMessage(err.error)
    });
  } else if (err instanceof AxiosError) {
    errorMessage = err?.response?.data
      ? JSON.stringify(err?.response?.data)
      : (err?.message ?? "An unknown error occurred.");
  } else {
    errorMessage = (err as Error)?.message || "An unknown error occurred.";
  }

  return errorMessage.length <= MAX_MESSAGE_LENGTH
    ? errorMessage
    : `${errorMessage.substring(0, MAX_MESSAGE_LENGTH - 3)}...`;
};
