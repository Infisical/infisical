import { request } from "@app/lib/config/request";
import { getTriggerDevInstanceUrl } from "@app/services/app-connection/trigger-dev";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TTriggerDevEnvVar, TTriggerDevSyncWithCredentials } from "./trigger-dev-sync-types";

const MAX_RETRIES = 5;

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 60000);
  });

const isRateLimitError = (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 429;

const getEnvVarsBaseUrl = async (secretSync: TTriggerDevSyncWithCredentials) => {
  const {
    connection,
    destinationConfig: { projectRef, environment }
  } = secretSync;

  const instanceUrl = await getTriggerDevInstanceUrl(connection);

  return `${instanceUrl}/api/v1/projects/${encodeURIComponent(projectRef)}/envvars/${encodeURIComponent(environment)}`;
};

const listTriggerDevEnvVars = async (
  secretSync: TTriggerDevSyncWithCredentials,
  attempt = 0
): Promise<TTriggerDevEnvVar[]> => {
  const baseUrl = await getEnvVarsBaseUrl(secretSync);
  const { apiKey } = secretSync.connection.credentials;

  try {
    const { data } = await request.get<TTriggerDevEnvVar[]>(baseUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    return data;
  } catch (error) {
    if (isRateLimitError(error) && attempt < MAX_RETRIES) {
      await sleep();
      return listTriggerDevEnvVars(secretSync, attempt + 1);
    }
    throw error;
  }
};

const importTriggerDevEnvVars = async (
  secretSync: TTriggerDevSyncWithCredentials,
  variables: Record<string, string>,
  attempt = 0
): Promise<void> => {
  const baseUrl = await getEnvVarsBaseUrl(secretSync);
  const { apiKey } = secretSync.connection.credentials;
  // Default to marking synced variables as secret in Trigger.dev (they originate from a secrets manager)
  const isSecret = secretSync.syncOptions.markAsSecret ?? true;

  try {
    await request.post(
      `${baseUrl}/import`,
      { variables, override: true, isSecret },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    if (isRateLimitError(error) && attempt < MAX_RETRIES) {
      await sleep();
      await importTriggerDevEnvVars(secretSync, variables, attempt + 1);
      return;
    }
    throw error;
  }
};

const deleteTriggerDevEnvVar = async (
  secretSync: TTriggerDevSyncWithCredentials,
  key: string,
  attempt = 0
): Promise<void> => {
  const baseUrl = await getEnvVarsBaseUrl(secretSync);
  const { apiKey } = secretSync.connection.credentials;

  try {
    await request.delete(`${baseUrl}/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (isRateLimitError(error) && attempt < MAX_RETRIES) {
      await sleep();
      await deleteTriggerDevEnvVar(secretSync, key, attempt + 1);
      return;
    }
    throw error;
  }
};

export const TriggerDevSyncFns = {
  syncSecrets: async (secretSync: TTriggerDevSyncWithCredentials, secretMap: TSecretMap) => {
    const { environment, syncOptions } = secretSync;

    const variables: Record<string, string> = Object.fromEntries(
      Object.entries(secretMap).map(([key, secret]) => [key, secret.value ?? ""])
    );

    if (Object.keys(variables).length > 0) {
      try {
        await importTriggerDevEnvVars(secretSync, variables);
      } catch (error) {
        // The import is a single batch call, so the failure isn't attributable to one key
        throw new SecretSyncError({
          error
        });
      }
    }

    if (!syncOptions.disableSecretDeletion) {
      const existing = await listTriggerDevEnvVars(secretSync);

      const keysToDelete = existing
        .map((envVar) => envVar.name)
        .filter((key) => matchesSchema(key, environment?.slug || "", syncOptions.keySchema) && !(key in secretMap));

      await Promise.all(
        keysToDelete.map(async (key) => {
          try {
            await deleteTriggerDevEnvVar(secretSync, key);
          } catch (error) {
            throw new SecretSyncError({
              error,
              secretKey: key
            });
          }
        })
      );
    }
  },

  removeSecrets: async (secretSync: TTriggerDevSyncWithCredentials, secretMap: TSecretMap) => {
    const existing = await listTriggerDevEnvVars(secretSync);

    const keysToDelete = existing.map((envVar) => envVar.name).filter((key) => key in secretMap);

    await Promise.all(
      keysToDelete.map(async (key) => {
        try {
          await deleteTriggerDevEnvVar(secretSync, key);
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      })
    );
  },

  getSecrets: async (secretSync: TTriggerDevSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
