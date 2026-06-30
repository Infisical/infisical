import { z } from "zod";

import {
  hasuraCloudGraphqlRequest,
  listHasuraCloudProjects,
  THasuraCloudConnection
} from "@app/services/app-connection/hasura-cloud";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretMap } from "../secret-sync-types";
import { THasuraCloudSyncWithCredentials } from "./hasura-cloud-sync-types";

const ZGraphqlErrors = z.object({
  errors: z.array(z.object({ message: z.string() })).optional()
});

const assertNoGraphqlErrors = (responseBody: unknown) => {
  const { errors } = ZGraphqlErrors.parse(responseBody);

  if (errors?.length) {
    throw new SecretSyncError({
      message: `Hasura Cloud API error: ${errors.map((error) => error.message).join("; ")}`
    });
  }
};

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

const getTenantEnv = async (accessToken: string, tenantId: string) => {
  const responseBody = await hasuraCloudGraphqlRequest(accessToken, {
    query: "query getTenantEnv($tenantId: uuid!) { getTenantEnv(tenantId: $tenantId) { hash envVars } }",
    variables: { tenantId }
  });

  assertNoGraphqlErrors(responseBody);

  const parsed = ZGetTenantEnv.parse(responseBody);

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
  const responseBody = await hasuraCloudGraphqlRequest(accessToken, {
    query:
      "mutation updateTenantEnv($currentHash: String!, $envs: [UpdateEnvObject!]!, $tenantId: uuid!) { updateTenantEnv(currentHash: $currentHash, envs: $envs, tenantId: $tenantId) { hash envVars } }",
    variables: { currentHash, envs, tenantId }
  });

  assertNoGraphqlErrors(responseBody);

  return ZUpdateTenantEnv.parse(responseBody).data.updateTenantEnv.hash;
};

const deleteTenantEnv = async (accessToken: string, tenantId: string, currentHash: string, keys: string[]) => {
  const responseBody = await hasuraCloudGraphqlRequest(accessToken, {
    query:
      "mutation deleteTenantEnv($id: uuid!, $currentHash: String!, $env: [String!]!) { deleteTenantEnv(tenantId: $id, currentHash: $currentHash, deleteEnvs: $env) { hash envVars } }",
    variables: { id: tenantId, currentHash, env: keys }
  });

  assertNoGraphqlErrors(responseBody);
};

// Each Hasura Cloud project maps 1:1 to a tenant, so we resolve the tenant from the configured
// project rather than storing/selecting it separately. All env operations are keyed by tenant.
const resolveTenantId = async (connection: THasuraCloudConnection, projectId: string) => {
  const projects = await listHasuraCloudProjects(connection);
  const tenantId = projects.find((project) => project.id === projectId)?.tenantId;

  if (!tenantId) {
    throw new SecretSyncError({
      message: `Could not find a Hasura Cloud tenant for the configured project [projectId=${projectId}]`
    });
  }

  return tenantId;
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

      const tenantId = await resolveTenantId(connection, destinationConfig.projectId);
      const { environment: envVars } = await getTenantEnv(accessToken, tenantId);

      const entries: TSecretMap = {};

      for (const [key, value] of Object.entries(envVars)) {
        if (matchesSchema(key, environment?.slug || "", keySchema)) {
          entries[key] = { value };
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
    const { projectId } = destinationConfig;

    try {
      const tenantId = await resolveTenantId(connection, projectId);
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
          (key) =>
            matchesSchema(key, environment?.slug || "", keySchema) && !(key in secretMap) && !key.startsWith("HASURA_")
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
    const { projectId } = destinationConfig;

    try {
      const tenantId = await resolveTenantId(connection, projectId);
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
