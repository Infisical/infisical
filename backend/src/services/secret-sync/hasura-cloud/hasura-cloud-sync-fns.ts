import { z } from "zod";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger/logger";
import { HASURA_CLOUD_API_URL } from "@app/services/app-connection/hasura-cloud";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import { THasuraCloudSyncWithCredentials } from "./hasura-cloud-sync-types";

const ZGetTenantEnv = z.object({
  data: z.object({
    getTenantEnv: z.object({
      hash: z.string(),
      envVars: z.object({
        environment: z.record(z.string()).optional()
      })
    })
  })
});

const ZUpdateTenantEnv = z.object({
  data: z.object({
    updateTenantEnv: z.object({
      hash: z.string(),
      envVars: z.record(z.any())
    })
  })
});

const getHasuraCloudHeaders = (accessToken: string) => ({
  Authorization: `pat ${accessToken}`,
  "Content-Type": "application/json"
});

const getTenantEnv = async (accessToken: string, tenantId: string) => {
  const { data } = await request.post<unknown>(
    HASURA_CLOUD_API_URL,
    {
      query: "query getTenantEnv($tenantId: uuid!) { getTenantEnv(tenantId: $tenantId) { hash envVars } }",
      variables: { tenantId }
    },
    { headers: getHasuraCloudHeaders(accessToken) }
  );

  const parsed = ZGetTenantEnv.parse(data);

  return {
    hash: parsed.data.getTenantEnv.hash,
    environment: parsed.data.getTenantEnv.envVars.environment ?? {}
  };
};

const updateTenantEnv = async (
  accessToken: string,
  tenantId: string,
  currentHash: string,
  envs: { key: string; value: string }[]
) => {
  logger.info({ envs }, "Environments to update");
  const { data } = await request.post<unknown>(
    HASURA_CLOUD_API_URL,
    {
      query:
        "mutation updateTenantEnv($currentHash: String!, $envs: [UpdateEnvObject!]!, $tenantId: uuid!) { updateTenantEnv(currentHash: $currentHash, envs: $envs, tenantId: $tenantId) { hash envVars } }",
      variables: { currentHash, envs, tenantId }
    },
    { headers: getHasuraCloudHeaders(accessToken) }
  );

  logger.info({ data }, "Data");

  return ZUpdateTenantEnv.parse(data).data.updateTenantEnv.hash;
};

const deleteTenantEnv = async (accessToken: string, tenantId: string, currentHash: string, keys: string[]) => {
  await request.post<unknown>(
    HASURA_CLOUD_API_URL,
    {
      query:
        "mutation deleteTenantEnv($id: uuid!, $currentHash: String!, $env: [String!]!) { deleteTenantEnv(tenantId: $id, currentHash: $currentHash, deleteEnvs: $env) { hash envVars } }",
      variables: { id: tenantId, currentHash, env: keys }
    },
    { headers: getHasuraCloudHeaders(accessToken) }
  );
};

export const HasuraCloudSyncFns = {
  async getSecrets(secretSync: THasuraCloudSyncWithCredentials): Promise<TSecretMap> {
    try {
      const {
        destinationConfig,
        connection,
        environment,
        syncOptions: { keySchema }
      } = secretSync;
      const { accessToken } = connection.credentials;

      const { environment: envVars } = await getTenantEnv(accessToken, destinationConfig.tenantId);

      const entries: TSecretMap = {};

      for (const [key, value] of Object.entries(envVars)) {
        if (matchesSchema(key, environment?.slug || "", keySchema)) {
          entries[key] = { value: value ?? "" };
        }
      }

      return entries;
    } catch (error) {
      throw new SecretSyncError({
        error,
        message: "Failed to import secrets from Hasura Cloud"
      });
    }
  },

  async syncSecrets(secretSync: THasuraCloudSyncWithCredentials, secretMap: TSecretMap) {
    const {
      destinationConfig,
      connection,
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;
    const { accessToken } = connection.credentials;
    const { tenantId } = destinationConfig;

    try {
      const { hash, environment: existingEnvs } = await getTenantEnv(accessToken, tenantId);

      const envs = Object.entries(secretMap).map(([key, secret]) => ({ key, value: secret.value }));

      let currentHash = hash;

      // Only update if a key is new or an existing value has changed to avoid hasura cloud API errors
      const hasChanges = envs.some(({ key, value }) => existingEnvs[key] !== value);

      if (envs.length && hasChanges) {
        currentHash = await updateTenantEnv(accessToken, tenantId, currentHash, envs);
      }

      if (!disableSecretDeletion) {
        const keysToDelete = Object.keys(existingEnvs).filter(
          (key) => matchesSchema(key, environment?.slug || "", keySchema) && !(key in secretMap)
        );

        if (keysToDelete.length) {
          await deleteTenantEnv(accessToken, tenantId, currentHash, keysToDelete);
        }
      }
    } catch (error) {
      if (error instanceof SecretSyncError) throw error;

      throw new SecretSyncError({
        error,
        message: "Failed to sync secrets to Hasura Cloud"
      });
    }
  },

  async removeSecrets(secretSync: THasuraCloudSyncWithCredentials, secretMap: TSecretMap) {
    const { destinationConfig, connection } = secretSync;
    const { accessToken } = connection.credentials;
    const { tenantId } = destinationConfig;

    try {
      const { hash, environment: existingEnvs } = await getTenantEnv(accessToken, tenantId);

      const keysToDelete = Object.keys(existingEnvs).filter((key) => key in secretMap);

      if (keysToDelete.length) {
        await deleteTenantEnv(accessToken, tenantId, hash, keysToDelete);
      }
    } catch (error) {
      if (error instanceof SecretSyncError) throw error;

      throw new SecretSyncError({
        error,
        message: "Failed to remove secrets from Hasura Cloud"
      });
    }
  }
};
