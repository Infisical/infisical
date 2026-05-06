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

// A project-scope record is "merged" when it covers more than just the sync's env.
const isProjectRecordMerged = (vercelSecret: VercelApiSecret) => {
  const totalScope = vercelSecret.target.length + (vercelSecret.customEnvironmentIds?.length ?? 0);
  return totalScope > 1;
};

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

const isSubset = (a: readonly string[] | undefined, b: readonly string[] | undefined) => {
  const bSet = new Set(b ?? []);
  return (a ?? []).every((v) => bSet.has(v));
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

// True when an existing team shared env var's scope is a strict superset of the sync's scope
const teamVarStrictlyCoversSyncScope = (envVar: VercelSharedEnvVar, destinationConfig: TeamDestinationConfig) => {
  const effectiveTargets =
    (destinationConfig.sensitive
      ? destinationConfig.targetEnvironments?.filter((env) => env !== VercelEnvironmentType.Development)
      : destinationConfig.targetEnvironments) ?? [];

  if (!isSubset(effectiveTargets, envVar.target)) return false;

  const ourProjects = destinationConfig.targetProjects ?? [];
  const varProjects = envVar.projectId ?? [];

  // var.projectId empty means "team-wide / all projects" in Vercel
  if (varProjects.length > 0) {
    if (ourProjects.length === 0) return false;
    if (!isSubset(ourProjects, varProjects)) return false;
  }

  // If our sync claims all-custom-environments, the existing var must also have it set —
  // otherwise it doesn't cover the custom-env dimension we need.
  const ourApplyAll = Boolean(destinationConfig.applyToAllCustomEnvironments);
  const varApplyAll = Boolean(envVar.applyToAllCustomEnvironments);
  if (ourApplyAll && !varApplyAll) return false;

  // Scopes must not be exactly equal. If they are, this is the "owned" path.
  const targetEqual = setsEqual(envVar.target, effectiveTargets);
  const projectEqual = setsEqual(varProjects, ourProjects);
  const applyAllEqual = ourApplyAll === varApplyAll;
  return !(targetEqual && projectEqual && applyAllEqual);
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
      const sharedEnvVarsMap = new Map(allSharedEnvVars.map((s) => [s.key, s]));

      // Vars whose scope strictly covers ours — Vercel rejects creating an overlapping var,
      // so we must split (detach our scope from the existing var, then create a dedicated
      // record)
      const mergedSharedEnvVarsMap = new Map(
        allSharedEnvVars
          .filter((envVar) => teamVarStrictlyCoversSyncScope(envVar, teamDestinationConfig))
          .map((s) => [s.key, s])
      );

      const { targetEnvironments, targetProjects, sensitive, applyToAllCustomEnvironments } =
        secretSync.destinationConfig;

      for await (const key of Object.keys(secretMap)) {
        const existingVar = sharedEnvVarsMap.get(key);
        const mergedVar = mergedSharedEnvVarsMap.get(key);

        if (mergedVar) {
          await detachTeamSharedEnvVar(secretSync, mergedVar);
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
          // eslint-disable-next-line no-continue
          continue;
        }

        if (!existingVar) {
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
          // eslint-disable-next-line no-continue
          continue;
        }

        // Vercel does not allow changing a secret's `type` between encrypted and sensitive
        // via PATCH, so we delete and recreate when the desired sensitivity differs.
        const existingIsSensitive = existingVar.type === "sensitive";
        const sensitivityChanged = existingIsSensitive !== Boolean(sensitive);

        if (sensitivityChanged) {
          await deleteTeamSharedEnvVar(secretSync, existingVar);
          await createTeamSharedEnvVar(secretSync, key, secretMap[key].value);
          // eslint-disable-next-line no-continue
          continue;
        }

        const hasValueChanged = existingVar.value !== secretMap[key].value;

        // Sensitive secrets cannot target Development in Vercel — strip before comparing.
        const isSensitive = sensitive || existingVar.type === "sensitive";
        const effectiveTargets = targetEnvironments?.filter(
          (env) => !isSensitive || env !== VercelEnvironmentType.Development
        );

        const existingTarget = existingVar.target ?? [];
        const hasTargetChanged =
          effectiveTargets !== undefined
            ? existingTarget.length !== effectiveTargets.length ||
              !effectiveTargets.every((env) => existingTarget.includes(env))
            : false;

        const hasProjectsChanged = targetProjects
          ? (existingVar.projectId?.length ?? 0) !== targetProjects.length ||
            !targetProjects.every((pid) => existingVar.projectId?.includes(pid))
          : false;

        const hasAllCustomChanged =
          Boolean(applyToAllCustomEnvironments) !== (existingVar.applyToAllCustomEnvironments ?? false);

        if (hasValueChanged || hasTargetChanged || hasProjectsChanged || hasAllCustomChanged) {
          await updateTeamSharedEnvVar(secretSync, existingVar, secretMap[key].value);
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

    const vercelSecrets = await getVercelSecrets(secretSync);
    const vercelSecretsMap = new Map(vercelSecrets.map((s) => [s.key, s]));

    // Create or update secrets
    for await (const key of Object.keys(secretMap)) {
      const existingSecret = vercelSecretsMap.get(key);

      if (!existingSecret) {
        await createSecret(secretSync, secretMap, key);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Merged record (covers other environments too): detach our env from it — preserving
      // the original value for the remaining environments — then create a dedicated record.
      if (isProjectRecordMerged(existingSecret)) {
        await detachEnvFromProjectSecret(secretSync, existingSecret);
        await createSecret(secretSync, secretMap, key);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Vercel does not allow changing a secret's `type` between encrypted and sensitive
      // via PATCH, so we delete and recreate when the desired sensitivity differs.
      const existingIsSensitive = existingSecret.type === "sensitive";
      const sensitivityChanged = existingIsSensitive !== Boolean(secretSync.destinationConfig.sensitive);

      if (sensitivityChanged) {
        await deleteSecret(secretSync, existingSecret);
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

      // Skip merged rows: delete removes the whole multi-env record, not only this sync's scope.
      if (isProjectRecordMerged(vercelSecret)) {
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
