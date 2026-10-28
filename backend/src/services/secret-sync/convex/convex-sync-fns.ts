import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TConvexEnvVarChange, TConvexSyncWithCredentials } from "./convex-sync-types";

const CONVEX_RESERVED_PREFIX = "CONVEX_";
const CONVEX_ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isConvexReservedKey = (key: string) => key.startsWith(CONVEX_RESERVED_PREFIX);

const convexErrorMessage = (error: unknown) => {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message.trim();
    }
    if (error.response?.status) return `Convex returned HTTP ${error.response.status}`;
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
};

const throwConvexSyncError = (error: unknown, fallback: string): never => {
  if (error instanceof SecretSyncError) throw error;

  throw new SecretSyncError({
    error,
    message: `${fallback}: ${convexErrorMessage(error)}`
  });
};

const getDeploymentApiUrl = async (deploymentUrl: string) => {
  const trimmed = deploymentUrl.replace(/\/+$/, "");
  await blockLocalAndPrivateIpAddresses(trimmed);
  return `${trimmed}/api/v1`;
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
    const apiUrl = await getDeploymentApiUrl(deploymentUrl);
    const { data } = await request.get<unknown>(`${apiUrl}/list_environment_variables`, {
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
    const apiUrl = await getDeploymentApiUrl(deploymentUrl);
    await request.post(
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
