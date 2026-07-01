/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretMap } from "../secret-sync-types";
import { TRundeckSyncWithCredentials } from "./rundeck-sync-types";

// Rundeck Key Storage API version (matches the native Rundeck integration)
const RUNDECK_STORAGE_API_VERSION = 44;

const RUNDECK_SECRET_CONTENT_TYPE = "application/x-rundeck-data-password";

type TRundeckStorageResource = {
  name: string;
};

type TRundeckStorageListResponse = {
  resources: TRundeckStorageResource[];
};

/**
 * Secrets are stored under the selected project's Rundeck Key Storage:
 * keys/project/<project>/<path>/<secretKey>
 */
const getRundeckStoragePath = (project: string, path: string) => {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  const basePath = `keys/project/${encodeURIComponent(project)}`;
  return normalizedPath ? `${basePath}/${normalizedPath}` : basePath;
};

const getRundeckClientDetails = async (secretSync: TRundeckSyncWithCredentials) => {
  const { connection, destinationConfig } = secretSync;

  const instanceUrl = removeTrailingSlash(connection.credentials.instanceUrl);
  await blockLocalAndPrivateIpAddresses(instanceUrl);

  const storagePath = getRundeckStoragePath(destinationConfig.project, destinationConfig.path);

  return {
    baseUrl: `${instanceUrl}/api/${RUNDECK_STORAGE_API_VERSION}/storage/${storagePath}`,
    headers: {
      "X-Rundeck-Auth-Token": connection.credentials.apiToken
    }
  };
};

const listRundeckSecretKeys = async (baseUrl: string, headers: Record<string, string>): Promise<string[]> => {
  try {
    const { data } = await request.get<TRundeckStorageListResponse>(baseUrl, { headers });
    return data.resources.map((resource) => resource.name);
  } catch (error) {
    // The storage path does not exist until the first secret is written - treat as empty
    if (error instanceof AxiosError && error.response?.status === 404) {
      return [];
    }
    throw new SecretSyncError({ error });
  }
};

export const RundeckSyncFns = {
  async getSecrets(secretSync: TRundeckSyncWithCredentials): Promise<TSecretMap> {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(secretSync: TRundeckSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { baseUrl, headers } = await getRundeckClientDetails(secretSync);

    const existingSecretKeys = await listRundeckSecretKeys(baseUrl, headers);
    const existingSecretKeySet = new Set(existingSecretKeys);

    for (const key of Object.keys(secretMap)) {
      const value = secretMap[key].value ?? "";
      const url = `${baseUrl}/${key}`;

      try {
        if (existingSecretKeySet.has(key)) {
          await request.put(url, value, {
            headers: { ...headers, "Content-Type": RUNDECK_SECRET_CONTENT_TYPE }
          });
        } else {
          await request.post(url, value, {
            headers: { ...headers, "Content-Type": RUNDECK_SECRET_CONTENT_TYPE }
          });
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    for (const key of existingSecretKeys) {
      // Only remove keys managed by this sync (respecting the configured key schema)
      if (!matchesSchema(key, environment?.slug || "", keySchema)) continue;

      if (!(key in secretMap)) {
        try {
          await request.delete(`${baseUrl}/${key}`, { headers });
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: key });
        }
      }
    }
  },

  async removeSecrets(secretSync: TRundeckSyncWithCredentials, secretMap: TSecretMap) {
    const { baseUrl, headers } = await getRundeckClientDetails(secretSync);

    const existingSecretKeys = await listRundeckSecretKeys(baseUrl, headers);

    for (const key of existingSecretKeys) {
      if (!(key in secretMap)) continue;

      try {
        await request.delete(`${baseUrl}/${key}`, { headers });
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }
  }
};
