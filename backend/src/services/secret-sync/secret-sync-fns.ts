import { AxiosError } from "axios";

import {
  AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  AwsParameterStoreSyncFns
} from "@app/services/secret-sync/aws-parameter-store";
import {
  AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  AwsSecretsManagerSyncFns
} from "@app/services/secret-sync/aws-secrets-manager";
import { GITHUB_SYNC_LIST_OPTION, GithubSyncFns } from "@app/services/secret-sync/github";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  TSecretMap,
  TSecretSyncListItem,
  TSecretSyncWithCredentials
} from "@app/services/secret-sync/secret-sync-types";

import { GCP_SYNC_LIST_OPTION } from "./gcp";
import { GcpSyncFns } from "./gcp/gcp-sync-fns";

const SECRET_SYNC_LIST_OPTIONS: Record<SecretSync, TSecretSyncListItem> = {
  [SecretSync.AWSParameterStore]: AWS_PARAMETER_STORE_SYNC_LIST_OPTION,
  [SecretSync.AWSSecretsManager]: AWS_SECRETS_MANAGER_SYNC_LIST_OPTION,
  [SecretSync.GitHub]: GITHUB_SYNC_LIST_OPTION,
  [SecretSync.GCPSecretManager]: GCP_SYNC_LIST_OPTION
};

export const listSecretSyncOptions = () => {
  return Object.values(SECRET_SYNC_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
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
  syncSecrets: (secretSync: TSecretSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
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
      default:
        throw new Error(
          `Unhandled sync destination for sync secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  },
  getSecrets: async (secretSync: TSecretSyncWithCredentials): Promise<TSecretMap> => {
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
      default:
        throw new Error(
          `Unhandled sync destination for get secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }

    return secretMap;
    // return stripAffixes(secretSync, secretMap);
  },
  removeSecrets: (secretSync: TSecretSyncWithCredentials, secretMap: TSecretMap): Promise<void> => {
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
      default:
        throw new Error(
          `Unhandled sync destination for remove secrets fns: ${(secretSync as TSecretSyncWithCredentials).destination}`
        );
    }
  }
};

export const parseSyncErrorMessage = (err: unknown): string => {
  if (err instanceof SecretSyncError) {
    return JSON.stringify({
      secretKey: err.secretKey,
      error: err.message || parseSyncErrorMessage(err.error)
    });
  }

  if (err instanceof AxiosError) {
    return err?.response?.data ? JSON.stringify(err?.response?.data) : err?.message ?? "An unknown error occurred.";
  }

  return (err as Error)?.message || "An unknown error occurred.";
};
