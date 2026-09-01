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
        type: destinationConfig.sensitive ? "sensitive" : "encrypted",
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

type ProjectDestinationConfig = Extract<
  TVercelSyncWithCredentials["destinationConfig"],
  { scope: VercelSyncScope.Project }
>;

// A project-scope record is "merged" when it covers more than just the sync's env.
const isProjectRecordMerged = (vercelSecret: VercelApiSecret) => {
  const totalScope = vercelSecret.target.length + (vercelSecret.customEnvironmentIds?.length ?? 0);
  return totalScope > 1;
};

// True when a record covers this sync's env at all (regardless of branch).
const projectRecordCoversSyncEnv = (vercelSecret: VercelApiSecret, destinationConfig: ProjectDestinationConfig) => {
  if (!isVercelDefaultEnvType(destinationConfig.env)) {
    return Boolean(vercelSecret.customEnvironmentIds?.includes(destinationConfig.env));
  }
  return vercelSecret.target.includes(destinationConfig.env);
};

// True when a record's scope overlaps this sync's conflict space: the same env, and for preview
// the same branch scope (both branch-agnostic, or the same gitBranch). Vercel keys its conflict
// space on (target, gitBranch), so a branch-agnostic and a branch-specific record for the same key
// coexist. A branch is only meaningful for preview; an empty-string branch is branch-agnostic.
const projectRecordMatchesSyncScope = (vercelSecret: VercelApiSecret, destinationConfig: ProjectDestinationConfig) => {
  if (!projectRecordCoversSyncEnv(vercelSecret, destinationConfig)) return false;

  if (destinationConfig.env === VercelEnvironmentType.Preview) {
    return (vercelSecret.gitBranch || undefined) === (destinationConfig.branch || undefined);
  }

  return true;
};

// The dedicated record this sync should update in place: a non-merged record whose scope matches.
const isProjectSecretOwnedByThisSync = (vercelSecret: VercelApiSecret, destinationConfig: ProjectDestinationConfig) =>
  !isProjectRecordMerged(vercelSecret) && projectRecordMatchesSyncScope(vercelSecret, destinationConfig);

// Remove the sync's env from an existing Vercel project record, preserving the original value
// for the remaining environments. Falls back to a full delete if removing our env would leave
// the record with no scope at all.
const detachEnvFromProjectSecret = async (
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

  const newTarget = vercelSecret.target.filter((t) => t !== destinationConfig.env);
  const newCustomEnvironmentIds = (vercelSecret.customEnvironmentIds ?? []).filter(
    (id) => id !== destinationConfig.env
  );

  if (newTarget.length === 0 && newCustomEnvironmentIds.length === 0) {
    await deleteSecret(secretSync, vercelSecret);
    return;
  }

  try {
    await request.patch(
      `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${destinationConfig.app}/env/${vercelSecret.id}?teamId=${destinationConfig.teamId}`,
      {
        ...(vercelSecret.type !== "sensitive" && { key: vercelSecret.key }),
        type: vercelSecret.type,
        target: newTarget,
        customEnvironmentIds: newCustomEnvironmentIds
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
      return detachEnvFromProjectSecret(secretSync, vercelSecret, attempt + 1);
    }
    throw new SecretSyncError({
      error,
      secretKey: vercelSecret.key
    });
  }
};

// ===== Team-scoped shared environment variable functions =====

type TeamDestinationConfig = Extract<TVercelSyncWithCredentials["destinationConfig"], { scope: VercelSyncScope.Team }>;

const setsEqual = (a: readonly string[] | undefined, b: readonly string[] | undefined) => {
  const av = a ?? [];
  const bv = b ?? [];
  if (av.length !== bv.length) return false;
  const bSet = new Set(bv);
  return av.every((v) => bSet.has(v));
};

// Ownership is by exact (target, projectId, applyToAllCustomEnvironments) scope match.
const isTeamSharedEnvVarOwnedByThisSync = (envVar: VercelSharedEnvVar, destinationConfig: TeamDestinationConfig) => {
  const effectiveTargets = destinationConfig.sensitive
    ? destinationConfig.targetEnvironments?.filter((env) => env !== VercelEnvironmentType.Development)
    : destinationConfig.targetEnvironments;

  return (
    setsEqual(envVar.target, effectiveTargets) &&
    setsEqual(envVar.projectId, destinationConfig.targetProjects) &&
    Boolean(envVar.applyToAllCustomEnvironments) === Boolean(destinationConfig.applyToAllCustomEnvironments)
  );
};

// True when an existing team shared env var overlaps the sync's scope in Vercel's conflict
// space: (target, applyToAllCustomEnvironments).
const teamVarOverlapsSyncScope = (envVar: VercelSharedEnvVar, destinationConfig: TeamDestinationConfig) => {
  const effectiveTargets =
    (destinationConfig.sensitive
      ? destinationConfig.targetEnvironments?.filter((env) => env !== VercelEnvironmentType.Development)
      : destinationConfig.targetEnvironments) ?? [];
  const effectiveTargetsSet = new Set<string>(effectiveTargets);

  const targetOverlap = (envVar.target ?? []).some((t) => effectiveTargetsSet.has(t));
  const applyAllOverlap =
    Boolean(envVar.applyToAllCustomEnvironments) && Boolean(destinationConfig.applyToAllCustomEnvironments);

  return targetOverlap || applyAllOverlap;
};

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
  let totalRetries = 0;

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

      if (listResponse.pagination?.next && listResponse.data.length > 0) {
        params = { ...params, until: listResponse.pagination.next };
      } else {
        hasMore = false;
      }
    } catch (error) {
      if ((error as { response: { status: number } }).response.status === 429 && totalRetries < MAX_RETRIES) {
        totalRetries += 1;
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

const getOwnedTeamSharedEnvVars = async (secretSync: TVercelSyncWithCredentials): Promise<VercelSharedEnvVar[]> => {
  if (secretSync.destinationConfig.scope !== VercelSyncScope.Team) {
    throw new SecretSyncError({
      message: "Invalid scope for team-level Vercel secret sync",
      shouldRetry: false
    });
  }

  const teamDestinationConfig = secretSync.destinationConfig;
  const allSharedEnvVars = await getTeamSharedEnvVars(secretSync);
  return allSharedEnvVars.filter((envVar) => isTeamSharedEnvVarOwnedByThisSync(envVar, teamDestinationConfig));
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

  // When sensitive is enabled, the Development environment is not supported by Vercel.
  const effectiveTargetEnvironments = destinationConfig.targetEnvironments?.filter(
    (env) => !destinationConfig.sensitive || env !== VercelEnvironmentType.Development
  );

  if (
    destinationConfig.sensitive &&
    !destinationConfig.applyToAllCustomEnvironments &&
    (!effectiveTargetEnvironments || effectiveTargetEnvironments.length === 0)
  ) {
    throw new SecretSyncError({
      message:
        "Marking secrets as sensitive in Vercel is not supported for development environments. Add another target environment or disable Sensitive.",
      secretKey: key,
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
        type: destinationConfig.sensitive ? "sensitive" : "encrypted",
        ...(effectiveTargetEnvironments?.length ? { target: effectiveTargetEnvironments } : {}),
        ...(destinationConfig.targetProjects !== undefined ? { projectId: destinationConfig.targetProjects } : {}),
        applyToAllCustomEnvironments: Boolean(destinationConfig.applyToAllCustomEnvironments)
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

  const isExistingSensitive = envVar.type === "sensitive";

  // When sensitive is enabled, the Development environment is not supported by Vercel.
  const effectiveTargetEnvironments = destinationConfig.targetEnvironments?.filter(
    (env) => !(destinationConfig.sensitive || isExistingSensitive) || env !== VercelEnvironmentType.Development
  );

  if (
    (destinationConfig.sensitive || isExistingSensitive) &&
    !destinationConfig.applyToAllCustomEnvironments &&
    (!effectiveTargetEnvironments || effectiveTargetEnvironments.length === 0)
  ) {
    throw new SecretSyncError({
      message:
        "Marking secrets as sensitive in Vercel is not supported for development environments. Add another target environment or disable Sensitive.",
      secretKey: envVar.key,
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
            ...(effectiveTargetEnvironments !== undefined ? { target: effectiveTargetEnvironments } : {}),
            ...(destinationConfig.targetProjects !== undefined ? { projectId: destinationConfig.targetProjects } : {}),
            applyToAllCustomEnvironments: Boolean(destinationConfig.applyToAllCustomEnvironments)
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

// Detach this sync's scope from a team shared env var that strictly covers it. PATCHes the
// var to remove our targets and projects, preserving its original value/type for the remaining
// scopes. If the detach would leave the var with no scope at all, falls back to a full delete.
const detachTeamSharedEnvVar = async (
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

  const ourEffectiveTargets =
    (destinationConfig.sensitive
      ? destinationConfig.targetEnvironments?.filter((env) => env !== VercelEnvironmentType.Development)
      : destinationConfig.targetEnvironments) ?? [];
  const ourTargetsSet = new Set<string>(ourEffectiveTargets);

  // Vercel's conflict space for team shared env vars spans (key, target) and the
  // applyToAllCustomEnvironments flag — projectId is metadata about which projects see the
  // var on its scopes, not part of the conflict space.
  const newTarget = (envVar.target ?? []).filter((t) => !ourTargetsSet.has(t));

  // If our sync wants all-custom coverage and the existing var also has it, we must release
  // that claim on the existing var so our new dedicated record can take it.
  const ourApplyAll = Boolean(destinationConfig.applyToAllCustomEnvironments);
  const varApplyAll = Boolean(envVar.applyToAllCustomEnvironments);
  const newApplyAll = ourApplyAll ? false : varApplyAll;

  if (newTarget.length === 0 && !newApplyAll) {
    // No scope remains — the var has nothing to cover. Full delete.
    await deleteTeamSharedEnvVar(secretSync, envVar);
    return;
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
            target: newTarget,
            applyToAllCustomEnvironments: newApplyAll
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
        message: `Failed to detach scope from shared env var: ${updateResponse.failed[0].error.message}`,
        secretKey: envVar.key,
        shouldRetry: false
      });
    }
  } catch (error) {
    if (error instanceof SecretSyncError) throw error;
    if ((error as { response: { status: number } }).response.status === 429 && attempt < MAX_RETRIES) {
      await sleep();
      return detachTeamSharedEnvVar(secretSync, envVar, attempt + 1);
    }
    throw new SecretSyncError({ error, secretKey: envVar.key });
  }
};

export const VercelSyncFns = {
  syncSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const teamDestinationConfig = secretSync.destinationConfig;
      const allSharedEnvVars = await getTeamSharedEnvVars(secretSync);

      // Vercel allows multiple shared env var records with the same key when their
      // (target, applyToAllCustomEnvironments) scopes do not overlap. Group by key so we
      // don't lose siblings — a key-only Map would drop all but one and then any create or
      // scope-expanding patch would collide with the invisible sibling.
      const sharedEnvVarsByKey = new Map<string, VercelSharedEnvVar[]>();
      for (const envVar of allSharedEnvVars) {
        const arr = sharedEnvVarsByKey.get(envVar.key) ?? [];
        arr.push(envVar);
        sharedEnvVarsByKey.set(envVar.key, arr);
      }

      const { sensitive } = secretSync.destinationConfig;

      for await (const key of Object.keys(secretMap)) {
        const records = sharedEnvVarsByKey.get(key) ?? [];
        const ownedRecord = records.find((r) => isTeamSharedEnvVarOwnedByThisSync(r, teamDestinationConfig));
        const conflictingRecords = records.filter(
          (r) => r.id !== ownedRecord?.id && teamVarOverlapsSyncScope(r, teamDestinationConfig)
        );

        // Detach our scope from any sibling that overlaps ours before any create/recreate —
        // including ahead of the sensitivity-flip delete+create branch, whose CREATE would
        // otherwise collide with the sibling.
        for await (const conflict of conflictingRecords) {
          await detachTeamSharedEnvVar(secretSync, conflict);
        }

        if (!ownedRecord) {
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
          // eslint-disable-next-line no-continue
          continue;
        }

        // Vercel does not allow changing a secret's `type` between encrypted and sensitive
        // via PATCH, so we delete and recreate when the desired sensitivity differs.
        const existingIsSensitive = ownedRecord.type === "sensitive";
        const sensitivityChanged = existingIsSensitive !== Boolean(sensitive);

        if (sensitivityChanged) {
          await deleteTeamSharedEnvVar(secretSync, ownedRecord);
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
          // eslint-disable-next-line no-continue
          continue;
        }

        if (ownedRecord.value !== secretMap[key].value) {
          await updateTeamSharedEnvVar(secretSync, ownedRecord, secretMap[key].value);
        }
      }

      if (secretSync.syncOptions.disableSecretDeletion) return;

      const ownedEnvVars = allSharedEnvVars.filter((envVar) =>
        isTeamSharedEnvVarOwnedByThisSync(envVar, teamDestinationConfig)
      );

      for await (const sharedEnvVar of ownedEnvVars) {
        if (!matchesSchema(sharedEnvVar.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
          // eslint-disable-next-line no-continue
          continue;

        if (!secretMap[sharedEnvVar.key]) {
          await deleteTeamSharedEnvVar(secretSync, sharedEnvVar);
        }
      }

      return;
    }

    const projectDestinationConfig = secretSync.destinationConfig;
    const vercelSecrets = await getVercelSecrets(secretSync);

    // Vercel allows multiple project records with the same key when their (target, gitBranch)
    // scopes don't overlap (e.g. a branch-agnostic Preview record alongside a branch-specific
    // one). Group by key so we don't drop siblings — a key-only Map would keep just one, then act
    // on the wrong record and collide with the invisible sibling on create/patch.
    const vercelSecretsByKey = new Map<string, VercelApiSecret[]>();
    for (const vercelSecret of vercelSecrets) {
      const records = vercelSecretsByKey.get(vercelSecret.key) ?? [];
      records.push(vercelSecret);
      vercelSecretsByKey.set(vercelSecret.key, records);
    }

    // Create or update secrets
    for await (const key of Object.keys(secretMap)) {
      const records = vercelSecretsByKey.get(key) ?? [];

      // The dedicated record for this sync's exact env/branch scope, if any.
      const ownedRecord = records.find((record) => isProjectSecretOwnedByThisSync(record, projectDestinationConfig));

      // Merged records (cover other environments too) that overlap our exact scope: detach our
      // env from each — preserving the original value for the remaining environments — so a
      // dedicated record can own our scope. The branch scope must match too: a branch-agnostic
      // merged record does not conflict with a branch-specific sync (and vice versa), so detaching
      // it would wrongly strip our env from every other branch it covers.
      const mergedRecords = records.filter(
        (record) =>
          record.id !== ownedRecord?.id &&
          isProjectRecordMerged(record) &&
          projectRecordMatchesSyncScope(record, projectDestinationConfig)
      );
      for await (const merged of mergedRecords) {
        await detachEnvFromProjectSecret(secretSync, merged);
      }

      if (!ownedRecord) {
        await createSecret(secretSync, secretMap, key);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Vercel does not allow changing a secret's `type` between encrypted and sensitive
      // via PATCH, so we delete and recreate when the desired sensitivity differs.
      const existingIsSensitive = ownedRecord.type === "sensitive";
      const sensitivityChanged = existingIsSensitive !== Boolean(projectDestinationConfig.sensitive);

      if (sensitivityChanged) {
        await deleteSecret(secretSync, ownedRecord);
        await createSecret(secretSync, secretMap, key);
      } else if (ownedRecord.value !== secretMap[key].value) {
        await updateSecret(secretSync, secretMap, ownedRecord);
      }
    }

    // Delete secrets if disableSecretDeletion is not set
    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const vercelSecret of vercelSecrets) {
      if (!matchesSchema(vercelSecret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      // Only delete records this sync owns (its exact env/branch scope). This skips merged
      // multi-env rows — a delete would drop the whole record, not just our scope — and sibling
      // records on a different branch scope, which this sync doesn't manage.
      if (!isProjectSecretOwnedByThisSync(vercelSecret, projectDestinationConfig)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!secretMap[vercelSecret.key]) {
        await deleteSecret(secretSync, vercelSecret);
      }
    }
  },

  getSecrets: async (secretSync: TVercelSyncWithCredentials): Promise<TSecretMap> => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const sharedEnvVars = await getOwnedTeamSharedEnvVars(secretSync);
      return Object.fromEntries(sharedEnvVars.map((s) => [s.key, { value: s.value ?? "" }]));
    }

    const vercelSecrets = await getVercelSecrets(secretSync);
    return Object.fromEntries(vercelSecrets.map((s) => [s.key, { value: s.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TVercelSyncWithCredentials, secretMap: TSecretMap) => {
    if (secretSync.destinationConfig.scope === VercelSyncScope.Team) {
      const sharedEnvVars = await getOwnedTeamSharedEnvVars(secretSync);

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
