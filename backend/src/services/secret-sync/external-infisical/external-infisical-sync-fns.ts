/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { getExternalInfisicalAccessToken } from "@app/services/app-connection/external-infisical";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema, parseSyncErrorMessage } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TExternalInfisicalSyncWithCredentials } from "./external-infisical-sync-types";

/** 4xx client errors (except 429) are non-retryable; 5xx and network errors are retryable. */
const isNonRetryableStatus = (status: number | undefined): boolean =>
  Boolean(status && status >= 400 && status < 500 && status !== 429);

const withExternalInfisicalErrorHandling = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const shouldRetry = !isNonRetryableStatus(status);
      throw new SecretSyncError({
        error: err,
        message: parseSyncErrorMessage(err),
        shouldRetry
      });
    }
    throw err;
  }
};

type TRemoteSecret = {
  secretKey: string;
  secretValue: string;
  type: string;
};

const getAccessTokenAndBaseUrl = async (secretSync: TExternalInfisicalSyncWithCredentials) => {
  const { connection } = secretSync;
  const { credentials } = connection;
  const accessToken = await getExternalInfisicalAccessToken(credentials);
  const baseUrl = credentials.instanceUrl.replace(/\/$/, "");
  return { accessToken, baseUrl };
};

const fetchRemoteSecrets = async (secretSync: TExternalInfisicalSyncWithCredentials): Promise<TRemoteSecret[]> => {
  const { accessToken, baseUrl } = await getAccessTokenAndBaseUrl(secretSync);
  const { destinationConfig } = secretSync;

  const { data } = await request.get<{ secrets: TRemoteSecret[] }>(`${baseUrl}/api/v3/secrets/raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      workspaceId: destinationConfig.projectId,
      environment: destinationConfig.environment,
      secretPath: destinationConfig.secretPath
    }
  });

  return data.secrets;
};

const batchCreateSecrets = async (
  secretSync: TExternalInfisicalSyncWithCredentials,
  secrets: Array<{ secretKey: string; secretValue: string }>
) => {
  if (secrets.length === 0) return;

  const { accessToken, baseUrl } = await getAccessTokenAndBaseUrl(secretSync);
  const { destinationConfig } = secretSync;

  await request.post(
    `${baseUrl}/api/v3/secrets/batch/raw`,
    {
      workspaceId: destinationConfig.projectId,
      environment: destinationConfig.environment,
      secretPath: destinationConfig.secretPath,
      secrets: secrets.map((s) => ({
        secretKey: s.secretKey,
        secretValue: s.secretValue,
        type: "shared"
      }))
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
};

const batchUpdateSecrets = async (
  secretSync: TExternalInfisicalSyncWithCredentials,
  secrets: Array<{ secretKey: string; secretValue: string }>
) => {
  if (secrets.length === 0) return;

  const { accessToken, baseUrl } = await getAccessTokenAndBaseUrl(secretSync);
  const { destinationConfig } = secretSync;

  await request.patch(
    `${baseUrl}/api/v3/secrets/batch/raw`,
    {
      workspaceId: destinationConfig.projectId,
      environment: destinationConfig.environment,
      secretPath: destinationConfig.secretPath,
      secrets: secrets.map((s) => ({
        secretKey: s.secretKey,
        secretValue: s.secretValue,
        type: "shared"
      }))
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
};

const batchDeleteSecrets = async (secretSync: TExternalInfisicalSyncWithCredentials, secretKeys: string[]) => {
  if (secretKeys.length === 0) return;

  const { accessToken, baseUrl } = await getAccessTokenAndBaseUrl(secretSync);
  const { destinationConfig } = secretSync;

  await request.delete(`${baseUrl}/api/v3/secrets/batch/raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      workspaceId: destinationConfig.projectId,
      environment: destinationConfig.environment,
      secretPath: destinationConfig.secretPath,
      secrets: secretKeys.map((key) => ({ secretKey: key }))
    }
  });
};

export const ExternalInfisicalSyncFns = {
  syncSecrets: async (secretSync: TExternalInfisicalSyncWithCredentials, secretMap: TSecretMap) =>
    withExternalInfisicalErrorHandling(async () => {
      const remoteSecrets = await fetchRemoteSecrets(secretSync);
      const environmentSlug = secretSync.environment?.slug || "";
      const { disableSecretDeletion, keySchema } = secretSync.syncOptions;

      const remoteSecretMap = new Map(remoteSecrets.map((s) => [s.secretKey, s.secretValue]));

      const secretsToCreate: Array<{ secretKey: string; secretValue: string }> = [];
      const secretsToUpdate: Array<{ secretKey: string; secretValue: string }> = [];
      const secretsToDelete: string[] = [];

      for (const [key, { value }] of Object.entries(secretMap)) {
        const remoteValue = remoteSecretMap.get(key);

        if (remoteValue === undefined) {
          secretsToCreate.push({ secretKey: key, secretValue: value });
        } else if (remoteValue !== value) {
          secretsToUpdate.push({ secretKey: key, secretValue: value });
        }
      }

      if (!disableSecretDeletion) {
        for (const remoteSecret of remoteSecrets) {
          if (
            !(remoteSecret.secretKey in secretMap) &&
            matchesSchema(remoteSecret.secretKey, environmentSlug, keySchema)
          ) {
            secretsToDelete.push(remoteSecret.secretKey);
          }
        }
      }

      await batchCreateSecrets(secretSync, secretsToCreate);
      await batchUpdateSecrets(secretSync, secretsToUpdate);
      await batchDeleteSecrets(secretSync, secretsToDelete);
    }),

  getSecrets: async (secretSync: TExternalInfisicalSyncWithCredentials): Promise<TSecretMap> =>
    withExternalInfisicalErrorHandling(async () => {
      const remoteSecrets = await fetchRemoteSecrets(secretSync);
      return Object.fromEntries(remoteSecrets.map((s) => [s.secretKey, { value: s.secretValue ?? "" }]));
    }),

  removeSecrets: async (secretSync: TExternalInfisicalSyncWithCredentials, secretMap: TSecretMap) =>
    withExternalInfisicalErrorHandling(async () => {
      const secretsToDelete = Object.keys(secretMap);
      await batchDeleteSecrets(secretSync, secretsToDelete);
    })
};
