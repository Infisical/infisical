/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getExternalInfisicalAccessToken } from "@app/services/app-connection/external-infisical";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
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
        message: (err.response?.data as { message?: string })?.message ?? err.message,
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

type TRemoteContext = {
  accessToken: string;
  baseUrl: string;
};

const getRemoteContext = async (secretSync: TExternalInfisicalSyncWithCredentials): Promise<TRemoteContext> => {
  const { credentials } = secretSync.connection;
  const appCfg = getConfig();
  const isSelfSync =
    appCfg.SITE_URL !== undefined &&
    removeTrailingSlash(appCfg.SITE_URL) === removeTrailingSlash(credentials.instanceUrl);
  if (!isSelfSync) {
    await blockLocalAndPrivateIpAddresses(credentials.instanceUrl);
  }
  const baseUrl = isSelfSync ? `http://127.0.0.1:${appCfg.PORT}` : removeTrailingSlash(credentials.instanceUrl);
  const effectiveCredentials = isSelfSync ? { ...credentials, instanceUrl: baseUrl } : credentials;
  const accessToken = await getExternalInfisicalAccessToken(effectiveCredentials);
  return { accessToken, baseUrl };
};

const fetchRemoteSecrets = async (
  secretSync: TExternalInfisicalSyncWithCredentials,
  { accessToken, baseUrl }: TRemoteContext
): Promise<TRemoteSecret[]> => {
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
  secrets: Array<{ secretKey: string; secretValue: string }>,
  { accessToken, baseUrl }: TRemoteContext
) => {
  if (secrets.length === 0) return;

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
  secrets: Array<{ secretKey: string; secretValue: string }>,
  { accessToken, baseUrl }: TRemoteContext
) => {
  if (secrets.length === 0) return;

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

const batchDeleteSecrets = async (
  secretSync: TExternalInfisicalSyncWithCredentials,
  secretKeys: string[],
  { accessToken, baseUrl }: TRemoteContext
) => {
  if (secretKeys.length === 0) return;

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
      const ctx = await getRemoteContext(secretSync);
      const remoteSecrets = await fetchRemoteSecrets(secretSync, ctx);
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

      await batchCreateSecrets(secretSync, secretsToCreate, ctx);
      await batchUpdateSecrets(secretSync, secretsToUpdate, ctx);
      await batchDeleteSecrets(secretSync, secretsToDelete, ctx);
    }),

  getSecrets: async (secretSync: TExternalInfisicalSyncWithCredentials): Promise<TSecretMap> =>
    withExternalInfisicalErrorHandling(async () => {
      const ctx = await getRemoteContext(secretSync);
      const remoteSecrets = await fetchRemoteSecrets(secretSync, ctx);
      return Object.fromEntries(remoteSecrets.map((s) => [s.secretKey, { value: s.secretValue ?? "" }]));
    }),

  removeSecrets: async (secretSync: TExternalInfisicalSyncWithCredentials, secretMap: TSecretMap) =>
    withExternalInfisicalErrorHandling(async () => {
      const ctx = await getRemoteContext(secretSync);
      const secretsToDelete = Object.keys(secretMap);
      await batchDeleteSecrets(secretSync, secretsToDelete, ctx);
    })
};
