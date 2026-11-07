import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import {
  getConvexErrorMessage,
  resolveConvexDeploymentDestination
} from "@app/services/app-connection/convex/convex-connection-fns";
import { TConvexConnection } from "@app/services/app-connection/convex/convex-connection-types";
import { normalizeConvexDeploymentUrl } from "@app/services/app-connection/convex/convex-url";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TPreSaveTransformDestinationConfigFn, TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TConvexEnvVarChange, TConvexSyncWithCredentials } from "./convex-sync-types";

const CONVEX_RESERVED_PREFIX = "CONVEX_";
const CONVEX_ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isConvexReservedKey = (key: string) => key.startsWith(CONVEX_RESERVED_PREFIX);

const throwConvexSyncError = (error: unknown, fallback: string): never => {
  if (error instanceof SecretSyncError) throw error;

  throw new SecretSyncError({
    error,
    message: `${fallback}: ${getConvexErrorMessage(error)}`
  });
};

const getDeploymentApiUrl = (deploymentUrl: string) => {
  try {
    return `${normalizeConvexDeploymentUrl(deploymentUrl)}/api/v1`;
  } catch {
    throw new SecretSyncError({
      message: "Invalid Convex deployment URL.",
      shouldRetry: false
    });
  }
};

const getDeploymentAuthHeaders = (accessToken: string) => ({
  Authorization: `Convex ${accessToken}`,
  Accept: "application/json",
  "Content-Type": "application/json"
});

const parseEnvironmentVariables = (data: unknown): Record<string, string> => {
  if (!data || typeof data !== "object") return {};

  const payload = data as { environmentVariables?: unknown };
  const raw = payload.environmentVariables ?? data;

  const entries: Record<string, string> = {};

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const candidate = item as { name?: unknown; value?: unknown };
        if (typeof candidate.name === "string" && typeof candidate.value === "string") {
          entries[candidate.name] = candidate.value;
        }
      }
    }
    return entries;
  }

  if (!raw || typeof raw !== "object") return {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      entries[key] = value;
    }
  }
  return entries;
};

const listConvexEnvironmentVariables = async (
  secretSync: TConvexSyncWithCredentials
): Promise<Record<string, string>> => {
  const {
    destinationConfig: { deploymentUrl },
    connection: {
      credentials: { accessToken }
    }
  } = secretSync;

  try {
    const apiUrl = getDeploymentApiUrl(deploymentUrl);
    const { data } = await safeRequest.get<unknown>(`${apiUrl}/list_environment_variables`, {
      headers: getDeploymentAuthHeaders(accessToken)
    });
    return parseEnvironmentVariables(data);
  } catch (error) {
    return throwConvexSyncError(error, "Failed to list environment variables from Convex");
  }
};

const updateConvexEnvironmentVariables = async (
  secretSync: TConvexSyncWithCredentials,
  changes: TConvexEnvVarChange[]
) => {
  if (changes.length === 0) return;

  const {
    destinationConfig: { deploymentUrl },
    connection: {
      credentials: { accessToken }
    }
  } = secretSync;

  try {
    const apiUrl = getDeploymentApiUrl(deploymentUrl);
    await safeRequest.post(
      `${apiUrl}/update_environment_variables`,
      { changes },
      { headers: getDeploymentAuthHeaders(accessToken) }
    );
  } catch (error) {
    throwConvexSyncError(error, "Failed to update environment variables in Convex");
  }
};

const collectInvalidSecretKeys = (secretMap: TSecretMap) =>
  Object.keys(secretMap).filter((key) => !isConvexReservedKey(key) && !CONVEX_ENV_VAR_NAME_PATTERN.test(key));

export const convexPreSaveTransformDestinationConfig: TPreSaveTransformDestinationConfigFn = async (
  { destinationConfig, connectionId },
  { appConnectionDAL, kmsService }
) => {
  if (!destinationConfig) return destinationConfig;

  const appConnection = await appConnectionDAL.findById(connectionId);
  if (!appConnection) {
    throw new NotFoundError({
      message: `Could not find connection with ID '${connectionId}'`
    });
  }

  if (appConnection.app !== AppConnection.Convex) {
    throw new BadRequestError({
      message: `Connection with ID '${connectionId}' is not a Convex connection`
    });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService,
    projectId: appConnection.projectId
  })) as TConvexConnection["credentials"];

  const resolved = await resolveConvexDeploymentDestination({ credentials }, destinationConfig);

  return {
    ...destinationConfig,
    ...resolved
  };
};

export const ConvexSyncFns = {
  syncSecrets: async (secretSync: TConvexSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const invalidKeys = collectInvalidSecretKeys(secretMap);
    if (invalidKeys.length > 0) {
      throw new SecretSyncError({
        message: `The following secret names are not valid Convex environment variables: ${invalidKeys.join(", ")}. Convex names must start with a letter or underscore and contain only letters, digits, and underscores.`,
        shouldRetry: false
      });
    }

    const changes: TConvexEnvVarChange[] = [];
    const secretMapKeys = new Set(Object.keys(secretMap));

    for (const [key, secret] of Object.entries(secretMap)) {
      if (!isConvexReservedKey(key) && secret.value !== "") {
        changes.push({ name: key, value: secret.value });
      }
    }

    if (!disableSecretDeletion) {
      const existing = await listConvexEnvironmentVariables(secretSync);
      for (const key of Object.keys(existing)) {
        const shouldDelete =
          !isConvexReservedKey(key) &&
          matchesSchema(key, environment?.slug || "", keySchema) &&
          !secretMapKeys.has(key);
        if (shouldDelete) {
          changes.push({ name: key, value: null });
        }
      }
    }

    await updateConvexEnvironmentVariables(secretSync, changes);
  },

  getSecrets: async (secretSync: TConvexSyncWithCredentials): Promise<TSecretMap> => {
    const existing = await listConvexEnvironmentVariables(secretSync);
    const entries: TSecretMap = {};

    for (const [key, value] of Object.entries(existing)) {
      if (!isConvexReservedKey(key) && value !== "") {
        entries[key] = { value };
      }
    }

    return entries;
  },

  removeSecrets: async (secretSync: TConvexSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const existing = await listConvexEnvironmentVariables(secretSync);
    const changes: TConvexEnvVarChange[] = [];

    for (const key of Object.keys(secretMap)) {
      if (!isConvexReservedKey(key) && key in existing) {
        changes.push({ name: key, value: null });
      }
    }

    await updateConvexEnvironmentVariables(secretSync, changes);
  }
};
