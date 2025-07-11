import { request } from "@app/lib/config/request";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const getSecretKeys = async (secretSync: TCloudflareWorkersSyncWithCredentials): Promise<string[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken, accountId }
    }
  } = secretSync;

  const { data } = await request.get<{
    result: Array<{ name: string }>;
  }>(
    `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${destinationConfig.scriptId}/secrets`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    }
  );

  return data.result.map((s) => s.name);
};

export const CloudflareWorkersSyncFns = {
  syncSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId }
    } = secretSync;

    const existingSecretNames = await getSecretKeys(secretSync);
    const secretMapKeys = new Set(Object.keys(secretMap));

    const secretsToCreateOrUpdatePromises = Object.entries(secretMap).map(async ([key, val]) => {
      await delayMs(Math.max(0, applyJitter(100, 200)));
      await request.put(
        `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets`,
        { name: key, text: val.value, type: "secret_text" },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json"
          }
        }
      );
    });
    await Promise.all(secretsToCreateOrUpdatePromises);

    if (!secretSync.syncOptions.disableSecretDeletion) {
      const secretsToDeletePromises = existingSecretNames
        .filter((existingKey) => {
          const isManagedBySchema = matchesSchema(
            existingKey,
            secretSync.environment?.slug || "",
            secretSync.syncOptions.keySchema
          );
          const isInNewSecretMap = secretMapKeys.has(existingKey);
          return !isInNewSecretMap && isManagedBySchema;
        })
        .map(async (key) => {
          await delayMs(Math.max(0, applyJitter(100, 200)));
          await request.delete(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets/${key}`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`
              }
            }
          );
        });
      await Promise.all(secretsToDeletePromises);
    }
  },

  getSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId }
    } = secretSync;

    const existingSecretNames = await getSecretKeys(secretSync);
    const secretMapToRemoveKeys = new Set(Object.keys(secretMap));

    const deletePromises = existingSecretNames.map(async (existingKey) => {
      const isManagedBySchema = matchesSchema(
        existingKey,
        secretSync.environment?.slug || "",
        secretSync.syncOptions.keySchema
      );
      const isInSecretMapToRemove = secretMapToRemoveKeys.has(existingKey);

      if (isInSecretMapToRemove && isManagedBySchema) {
        await delayMs(Math.max(0, applyJitter(100, 200)));
        await request.delete(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets/${existingKey}`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
      }
    });
    await Promise.all(deletePromises);
  }
};
