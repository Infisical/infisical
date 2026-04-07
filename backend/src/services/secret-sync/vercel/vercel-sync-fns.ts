/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { VercelEnvironmentType, VercelSyncScope } from "./vercel-sync-enums";
import {
  DefaultVercelEnvType,
  TVercelSyncWithCredentials,
  VercelApiSecret,
  VercelSharedEnvVar
} from "./vercel-sync-types";

function isVercelDefaultEnvType(value: string): value is DefaultVercelEnvType {
  return Object.values(VercelEnvironmentType).map(String).includes(value);
}

const MAX_RETRIES = 5;

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 60000);
  });

const getVercelSecretsWithRetries = async (
  secretSync: TVercelSyncWithCredentials,
  attempt = 0
): Promise<VercelApiSecret[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Project) {
    throw new SecretSyncError({
      message: "Invalid scope for Vercel secret sync",
      shouldRetry: false
    });
  }

  const params: { [key: string]: string } = {
    decrypt: "true",
    ...(destinationConfig.branch ? { gitBranch: destinationConfig.branch } : {})
  };
  try {
    const { data } = await request.get<{ envs: VercelApiSecret[] }>(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env?teamId=${destinationConfig.teamId}`,
      {
        params,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    return data.envs;
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return await getVercelSecretsWithRetries(secretSync, attempt + 1);
    }
    throw error;
  }
};

const getDecryptedVercelSecret = async (
  secretSync: TVercelSyncWithCredentials,
  secret: VercelApiSecret,
  attempt = 0
): Promise<VercelApiSecret> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Project) {
    throw new SecretSyncError({
      message: "Invalid scope for Vercel secret sync",
      shouldRetry: false
    });
  }

  const params: { [key: string]: string } = {
    decrypt: "true",
    ...(destinationConfig.branch ? { gitBranch: destinationConfig.branch } : {})
  };

  try {
    const { data: decryptedSecret } = await request.get(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${secret.id}?teamId=${destinationConfig.teamId}`,
      {
        params,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    return decryptedSecret as VercelApiSecret;
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return await getDecryptedVercelSecret(secretSync, secret, attempt + 1);
    }
    throw error;
  }
};

const getVercelSecrets = async (secretSync: TVercelSyncWithCredentials): Promise<VercelApiSecret[]> => {
  const { destinationConfig } = secretSync;

  const secrets = await getVercelSecretsWithRetries(secretSync);

  if (destinationConfig.scope !== VercelSyncScope.Project) {
    throw new SecretSyncError({
      message: "Invalid scope for Vercel secret sync",
      shouldRetry: false
    });
  }

  const filteredSecrets = secrets.filter((secret) => {
    if (!isVercelDefaultEnvType(destinationConfig.env)) {
      if (secret.customEnvironmentIds?.includes(destinationConfig.env)) {
        return true;
      }
      return false;
    }
    if (secret.target.includes(destinationConfig.env)) {
      // If it's preview environment with a branch specified
      if (
        destinationConfig.env === VercelEnvironmentType.Preview &&
        destinationConfig.branch &&
        secret.gitBranch &&
        secret.gitBranch !== destinationConfig.branch
      ) {
        return false;
      }
      return true;
    }
    return false;
  });

  // For secrets of type "encrypted", we need to get their decrypted value
  const secretsWithValues = await Promise.all(
    filteredSecrets.map(async (secret) => {
      if (secret.type === "encrypted") {
        const decryptedSecret = await getDecryptedVercelSecret(secretSync, secret);
        return decryptedSecret;
      }
      return secret;
    })
  );

  return secretsWithValues;
};

const deleteSecret = async (
  secretSync: TVercelSyncWithCredentials,
  vercelSecret: VercelApiSecret,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Project) {
    throw new SecretSyncError({
      message: "Invalid scope for Vercel secret sync",
      shouldRetry: false
    });
  }

  try {
    await request.delete(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${vercelSecret.id}?teamId=${destinationConfig.teamId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return await deleteSecret(secretSync, vercelSecret, attempt + 1);
    }
    throw new SecretSyncError({
      error,
      secretKey: vercelSecret.key
    });
  }
};

const createSecret = async (
  secretSync: TVercelSyncWithCredentials,
  secretMap: TSecretMap,
  key: string,
  attempt = 0
): Promise<void> => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    if (destinationConfig.scope !== VercelSyncScope.Project) {
      throw new SecretSyncError({
        message: "Invalid scope for Vercel secret sync",
        shouldRetry: false
      });
    }

    await request.post(
      `${IntegrationUrls.VERCEL_API_URL}/v10/projects/${destinationConfig.app}/env?teamId=${destinationConfig.teamId}`,
      {
        key,
        value: secretMap[key].value,
        type: "encrypted",
        target: isVercelDefaultEnvType(destinationConfig.env) ? [destinationConfig.env] : [],
        customEnvironmentIds: !isVercelDefaultEnvType(destinationConfig.env) ? [destinationConfig.env] : [],
        ...(destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch
          ? { gitBranch: destinationConfig.branch }
          : {})
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return await createSecret(secretSync, secretMap, key, attempt + 1);
    }
    throw new SecretSyncError({
      error,
      secretKey: key
    });
  }
};

const updateSecret = async (
  secretSync: TVercelSyncWithCredentials,
  secretMap: TSecretMap,
  vercelSecret: VercelApiSecret,
  attempt = 0
): Promise<void> => {
  try {
    const {
      destinationConfig,
      connection: {
        credentials: { apiToken }
      }
    } = secretSync;

    if (destinationConfig.scope !== VercelSyncScope.Project) {
      throw new SecretSyncError({
        message: "Invalid scope for Vercel secret sync",
        shouldRetry: false
      });
    }

    let target = [...vercelSecret.target];
    if (isVercelDefaultEnvType(destinationConfig.env) && !vercelSecret.target.includes(destinationConfig.env)) {
      target = [...target, destinationConfig.env];
    }
    let customEnvironmentIds = [...(vercelSecret.customEnvironmentIds || [])];
    if (
      !isVercelDefaultEnvType(destinationConfig.env) &&
      !vercelSecret.customEnvironmentIds?.includes(destinationConfig.env)
    ) {
      customEnvironmentIds = [...customEnvironmentIds, destinationConfig.env];
    }

    await request.patch(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${vercelSecret.id}?teamId=${destinationConfig.teamId}`,
      {
        ...(vercelSecret.type !== "sensitive" && { key: vercelSecret.key }),
        value: secretMap[vercelSecret.key].value,
        type: vercelSecret.type,
        target,
        customEnvironmentIds,
        ...(destinationConfig.env === VercelEnvironmentType.Preview && destinationConfig.branch
          ? { gitBranch: destinationConfig.branch }
          : {})
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return await updateSecret(secretSync, secretMap, vercelSecret, attempt + 1);
    }
    throw new SecretSyncError({
      error,
      secretKey: vercelSecret.key
    });
  }
};

// ===== Team-scoped shared environment variable functions =====

const listTeamSharedEnvVarsWithRetries = async (
  secretSync: TVercelSyncWithCredentials
): Promise<VercelSharedEnvVar[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  const allEnvVars: VercelSharedEnvVar[] = [];
  let hasMore = true;
  let params: Record<string, string | number> = {};
  let attempt = 0;

  while (hasMore) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data: listResponse } = await request.get<{
        data: VercelSharedEnvVar[];
        pagination: { next: number | null };
      }>(`${IntegrationUrls.VERCEL_API_URL}/v1/env?teamId=${destinationConfig.teamId}`, {
        params,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      allEnvVars.push(...listResponse.data);
      attempt = 0;

      if (listResponse.pagination?.next) {
        params = { ...params, since: listResponse.pagination.next };
      } else {
        hasMore = false;
      }
    } catch (error) {
      if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
        attempt += 1;
        // eslint-disable-next-line no-await-in-loop
        await sleep();
      } else {
        throw error;
      }
    }
  }

  return allEnvVars;
};

const getDecryptedTeamSharedEnvVar = async (
  secretSync: TVercelSyncWithCredentials,
  envVar: VercelSharedEnvVar,
  attempt = 0
): Promise<VercelSharedEnvVar> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  try {
    const { data: decryptedEnvVar } = await request.get<VercelSharedEnvVar>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/env/${envVar.id}?teamId=${destinationConfig.teamId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    return decryptedEnvVar;
  } catch (error) {
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return getDecryptedTeamSharedEnvVar(secretSync, envVar, attempt + 1);
    }
    throw error;
  }
};

const getTeamSharedEnvVars = async (secretSync: TVercelSyncWithCredentials): Promise<VercelSharedEnvVar[]> => {
  const envVars = await listTeamSharedEnvVarsWithRetries(secretSync);

  const envVarsWithValues = await Promise.all(
    envVars.map(async (envVar) => {
      if (envVar.type === "encrypted") {
        return getDecryptedTeamSharedEnvVar(secretSync, envVar);
      }
      return envVar;
    })
  );

  return envVarsWithValues;
};

const createTeamSharedEnvVar = async (
  secretSync: TVercelSyncWithCredentials,
  key: string,
  value: string,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  try {
    const { data: createResponse } = await request.post<{
      created: VercelSharedEnvVar[];
      failed: { error: { code: string; message: string } }[];
    }>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/env?teamId=${destinationConfig.teamId}`,
      {
        evs: [{ key, value }],
        type: "encrypted",
        ...(destinationConfig.targetEnvironments?.length ? { target: destinationConfig.targetEnvironments } : {}),
        ...(destinationConfig.targetProjects !== undefined ? { projectId: destinationConfig.targetProjects } : {})
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    if (createResponse.failed?.length > 0) {
      throw new SecretSyncError({
        message: `Failed to create shared env var: ${createResponse.failed[0].error.message}`,
        secretKey: key,
        shouldRetry: false
      });
    }
  } catch (error) {
    if (error instanceof SecretSyncError) throw error;
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return createTeamSharedEnvVar(secretSync, key, value, attempt + 1);
    }
    throw new SecretSyncError({ error, secretKey: key });
  }
};

const updateTeamSharedEnvVar = async (
  secretSync: TVercelSyncWithCredentials,
  envVar: VercelSharedEnvVar,
  value: string,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  try {
    const { data: updateResponse } = await request.patch<{
      updated: VercelSharedEnvVar[];
      failed: { error: { code: string; message: string } }[];
    }>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/env?teamId=${destinationConfig.teamId}`,
      {
        updates: {
          [envVar.id]: {
            value,
            ...(destinationConfig.targetEnvironments?.length ? { target: destinationConfig.targetEnvironments } : {}),
            ...(destinationConfig.targetProjects !== undefined ? { projectId: destinationConfig.targetProjects } : {})
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    if (updateResponse.failed?.length > 0) {
      throw new SecretSyncError({
        message: `Failed to update shared env var: ${updateResponse.failed[0].error.message}`,
        secretKey: envVar.key,
        shouldRetry: false
      });
    }
  } catch (error) {
    if (error instanceof SecretSyncError) throw error;
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return updateTeamSharedEnvVar(secretSync, envVar, value, attempt + 1);
    }
    throw new SecretSyncError({ error, secretKey: envVar.key });
  }
};

const deleteTeamSharedEnvVar = async (
  secretSync: TVercelSyncWithCredentials,
  envVar: VercelSharedEnvVar,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken }
    }
  } = secretSync;

  if (destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  try {
    const { data: deleteResponse } = await request.delete<{
      deleted: string[];
      failed: { error: { code: string; message: string } }[];
    }>(`${IntegrationUrls.VERCEL_API_URL}/v1/env?teamId=${destinationConfig.teamId}`, {
      data: { ids: [envVar.id] },
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Accept-Encoding": "application/json"
      }
    });

    if (deleteResponse.failed?.length > 0) {
      throw new SecretSyncError({
        message: `Failed to delete shared env var: ${deleteResponse.failed[0].error.message}`,
        secretKey: envVar.key,
        shouldRetry: false
      });
    }
  } catch (error) {
    if (error instanceof SecretSyncError) throw error;
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return deleteTeamSharedEnvVar(secretSync, envVar, attempt + 1);
    }
    throw new SecretSyncError({ error, secretKey: envVar.key });
  }
};

export const VercelSyncFns = {
  syncSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const sharedEnvVars = await getTeamSharedEnvVars(secretSync);
      const sharedEnvVarsMap = new Map(sharedEnvVars.map((s) => [s.key, s]));

      const { targetEnvironments, targetProjects } = secretSync.destinationConfig;

      for await (const key of Object.keys(secretMap)) {
        const existingVar = sharedEnvVarsMap.get(key);

        if (!existingVar) {
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
        } else {
          const hasValueChanged = existingVar.value !== secretMap[key].value;

          const hasTargetChanged = targetEnvironments?.length
            ? existingVar.target.length !== targetEnvironments.length ||
              !targetEnvironments.every((env) => existingVar.target.includes(env))
            : false;

          const hasProjectsChanged = targetProjects
            ? (existingVar.projectId?.length ?? 0) !== targetProjects.length ||
              !targetProjects.every((pid) => existingVar.projectId?.includes(pid))
            : false;

          if (hasValueChanged || hasTargetChanged || hasProjectsChanged) {
            await updateTeamSharedEnvVar(secretSync, existingVar, secretMap[key].value);
          }
        }
      }

      if (secretSync.syncOptions.disableSecretDeletion) return;

      for await (const sharedEnvVar of sharedEnvVars) {
        if (!matchesSchema(sharedEnvVar.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
          // eslint-disable-next-line no-continue
          continue;

        if (!secretMap[sharedEnvVar.key]) {
          await deleteTeamSharedEnvVar(secretSync, sharedEnvVar);
        }
      }

      return;
    }

    const vercelSecrets = await getVercelSecrets(secretSync);
    const vercelSecretsMap = new Map(vercelSecrets.map((s) => [s.key, s]));

    // Create or update secrets
    for await (const key of Object.keys(secretMap)) {
      const existingSecret = vercelSecretsMap.get(key);

      if (!existingSecret) {
        await createSecret(secretSync, secretMap, key);
      } else if (existingSecret.value !== secretMap[key].value) {
        await updateSecret(secretSync, secretMap, existingSecret);
      }
    }

    // Delete secrets if disableSecretDeletion is not set
    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const vercelSecret of vercelSecrets) {
      if (!matchesSchema(vercelSecret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!secretMap[vercelSecret.key]) {
        await deleteSecret(secretSync, vercelSecret);
      }
    }
  },

  getSecrets: async (secretSync: TVercelSyncWithCredentials): Promise<TSecretMap> => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const sharedEnvVars = await getTeamSharedEnvVars(secretSync);
      return Object.fromEntries(sharedEnvVars.map((s) => [s.key, { value: s.value ?? "" }]));
    }

    const vercelSecrets = await getVercelSecrets(secretSync);
    return Object.fromEntries(vercelSecrets.map((s) => [s.key, { value: s.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const sharedEnvVars = await getTeamSharedEnvVars(secretSync);

      for await (const sharedEnvVar of sharedEnvVars) {
        if (sharedEnvVar.key in secretMap) {
          await deleteTeamSharedEnvVar(secretSync, sharedEnvVar);
        }
      }

      return;
    }

    const vercelSecrets = await getVercelSecrets(secretSync);

    for await (const vercelSecret of vercelSecrets) {
      if (vercelSecret.key in secretMap) {
        await deleteSecret(secretSync, vercelSecret);
      }
    }
  }
};
