/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { getRundeckInstanceUrl } from "@app/services/app-connection/rundeck";
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

  const instanceUrl = await getRundeckInstanceUrl(connection);
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

const deleteRundeckSecret = async (baseUrl: string, key: string, headers: Record<string, string>) => {
  try {
    await request.delete(`${baseUrl}/${key}`, { headers });
  } catch (error) {
    throw new SecretSyncError({ error, secretKey: key });
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
    const writeHeaders = { ...headers, "Content-Type": RUNDECK_SECRET_CONTENT_TYPE };

    const existingSecretKeys = await listRundeckSecretKeys(baseUrl, headers);
    const existingSecretKeySet = new Set(existingSecretKeys);

    for (const key of Object.keys(secretMap)) {
      const url = `${baseUrl}/${key}`;
      const value = secretMap[key].value ?? "";

      // POST creates a new key; PUT overwrites an existing one
      try {
        if (existingSecretKeySet.has(key)) {
          await request.put(url, value, { headers: writeHeaders });
        } else {
          await request.post(url, value, { headers: writeHeaders });
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
        await deleteRundeckSecret(baseUrl, key, headers);
      }
    }
  },

  async removeSecrets(secretSync: TRundeckSyncWithCredentials, secretMap: TSecretMap) {
    const { baseUrl, headers } = await getRundeckClientDetails(secretSync);

    const existingSecretKeys = await listRundeckSecretKeys(baseUrl, headers);

    for (const key of existingSecretKeys) {
      if (key in secretMap) {
        await deleteRundeckSecret(baseUrl, key, headers);
      }
    }
  }
};
