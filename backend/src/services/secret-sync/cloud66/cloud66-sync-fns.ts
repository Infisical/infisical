import { request } from "@app/lib/config/request";
import {
  CLOUD_66_API_BASE_URL,
  getCloud66Headers,
  paginateCloud66
} from "@app/services/app-connection/cloud-66/cloud-66-connection-fns";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TCloud66EnvVar, TCloud66SyncWithCredentials } from "./cloud66-sync-types";

// Cloud 66 system-managed variables (readonly / generated) cannot be modified or deleted via the API.
const isModifiable = (envVar: TCloud66EnvVar) => !envVar.readonly && !envVar.is_generated;

const listCloud66EnvVars = (accessToken: string, stackId: string): Promise<TCloud66EnvVar[]> =>
  paginateCloud66<TCloud66EnvVar>(accessToken, `/3/stacks/${encodeURIComponent(stackId)}/environments`);

const createCloud66EnvVar = (accessToken: string, stackId: string, key: string, value: string) =>
  request.post(
    `${CLOUD_66_API_BASE_URL}/3/stacks/${encodeURIComponent(stackId)}/environments`,
    { key, value },
    { headers: getCloud66Headers(accessToken) }
  );

const updateCloud66EnvVar = (accessToken: string, stackId: string, key: string, value: string) =>
  request.put(
    `${CLOUD_66_API_BASE_URL}/3/stacks/${encodeURIComponent(stackId)}/environments/${encodeURIComponent(key)}`,
    { value },
    { headers: getCloud66Headers(accessToken) }
  );

const deleteCloud66EnvVar = (accessToken: string, stackId: string, key: string) =>
  request.delete(
    `${CLOUD_66_API_BASE_URL}/3/stacks/${encodeURIComponent(stackId)}/environments/${encodeURIComponent(key)}`,
    {
      headers: getCloud66Headers(accessToken)
    }
  );

export const Cloud66SyncFns = {
  async syncSecrets(secretSync: TCloud66SyncWithCredentials, secretMap: TSecretMap) {
    const {
      connection,
      environment,
      destinationConfig: { stackId },
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { accessToken } = connection.credentials;

    const existingEnvVars = await listCloud66EnvVars(accessToken, stackId);
    const existingByKey = new Map(existingEnvVars.map((envVar) => [envVar.key, envVar]));

    for (const [key, { value }] of Object.entries(secretMap)) {
      const existing = existingByKey.get(key);

      // Cloud 66 does not allow environment variables with hyphens
      if (key.includes("-")) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        if (existing) {
          // Skip system-managed variables and unchanged values
          if (!isModifiable(existing) || existing.value === value) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          await updateCloud66EnvVar(accessToken, stackId, key, value);
        } else {
          // eslint-disable-next-line no-await-in-loop
          await createCloud66EnvVar(accessToken, stackId, key, value);
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    for (const envVar of existingEnvVars) {
      // Never touch system-managed variables, and only consider keys matching the configured schema
      if (!isModifiable(envVar) || !matchesSchema(envVar.key, environment?.slug || "", keySchema)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!(envVar.key in secretMap)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await deleteCloud66EnvVar(accessToken, stackId, envVar.key);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: envVar.key });
        }
      }
    }
  },

  async getSecrets(secretSync: TCloud66SyncWithCredentials): Promise<TSecretMap> {
    const {
      connection,
      destinationConfig: { stackId }
    } = secretSync;

    const { accessToken } = connection.credentials;

    const existingEnvVars = await listCloud66EnvVars(accessToken, stackId);

    return Object.fromEntries(existingEnvVars.map((envVar) => [envVar.key, { value: envVar.value }]));
  },

  async removeSecrets(secretSync: TCloud66SyncWithCredentials, secretMap: TSecretMap) {
    const {
      connection,
      destinationConfig: { stackId }
    } = secretSync;

    const { accessToken } = connection.credentials;

    const existingEnvVars = await listCloud66EnvVars(accessToken, stackId);

    for (const envVar of existingEnvVars) {
      if (isModifiable(envVar) && envVar.key in secretMap) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await deleteCloud66EnvVar(accessToken, stackId, envVar.key);
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: envVar.key });
        }
      }
    }
  }
};
