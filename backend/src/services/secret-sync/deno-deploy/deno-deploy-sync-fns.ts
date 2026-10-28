import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { getDenoDeployAuthHeaders } from "@app/services/app-connection/deno-deploy";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { DenoDeploySyncContext } from "./deno-deploy-sync-enums";
import {
  TDenoDeployApp,
  TDenoDeployEnvVar,
  TDenoDeployEnvVarContexts,
  TDenoDeployEnvVarUpdate,
  TDenoDeploySyncWithCredentials
} from "./deno-deploy-sync-types";

const DENO_DEPLOY_KEY_MAX_LENGTH = 128;
const DENO_DEPLOY_RESERVED_PREFIXES = ["DENO_", "LD_", "OTEL_"];
const DENO_DEPLOY_ALLOWED_DENO_KEYS = new Set([
  "DENO_AUTH_TOKENS",
  "DENO_COMPAT",
  "DENO_CONDITIONS",
  "DENO_DEPLOY_ENDPOINT",
  "DENO_DEPLOY_TOKEN"
]);

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 422]);

const DENO_DEPLOY_SECRET_NAME_RULE =
  "Names must be 1-128 characters, cannot contain '=', null bytes, or leading or trailing whitespace, and cannot start with DENO_, LD_, or OTEL_ except for an allowlist of Deno runtime names.";

export const isDenoDeploySecretName = (key: string) => {
  if (
    !key ||
    key.length > DENO_DEPLOY_KEY_MAX_LENGTH ||
    key.includes("=") ||
    key.includes("\0") ||
    key !== key.trim()
  ) {
    return false;
  }
  if (DENO_DEPLOY_ALLOWED_DENO_KEYS.has(key)) return true;
  return !DENO_DEPLOY_RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

const destinationContexts = (context: DenoDeploySyncContext): TDenoDeployEnvVarContexts =>
  context === DenoDeploySyncContext.All ? DenoDeploySyncContext.All : [context];

const toContextList = (contexts: TDenoDeployEnvVarContexts | undefined): string[] => {
  if (!contexts || contexts === DenoDeploySyncContext.All) return [DenoDeploySyncContext.All];
  if (contexts.includes(DenoDeploySyncContext.All)) return [DenoDeploySyncContext.All];
  return [...new Set(contexts)].sort();
};

export const isExactDenoDeployContextMatch = (
  varContexts: TDenoDeployEnvVarContexts | undefined,
  destination: DenoDeploySyncContext
) => {
  const list = toContextList(varContexts);
  if (destination === DenoDeploySyncContext.All) {
    return list.length === 1 && list[0] === DenoDeploySyncContext.All;
  }
  return list.length === 1 && list[0] === destination;
};

export const overlapsDenoDeployContext = (
  varContexts: TDenoDeployEnvVarContexts | undefined,
  destination: DenoDeploySyncContext
) => {
  const list = toContextList(varContexts);
  if (list.includes(DenoDeploySyncContext.All) || destination === DenoDeploySyncContext.All) return true;
  return list.includes(destination);
};

const getDenoDeployErrorMessage = (error: unknown) => {
  if (!isAxiosError(error)) return undefined;
  const body = error.response?.data as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === "string" && body.error.message ? body.error.message : undefined;
};

const toDenoDeploySyncError = (error: unknown, secretKey?: string) => {
  if (error instanceof SecretSyncError) return error;

  const status = isAxiosError(error) ? error.response?.status : undefined;
  const shouldRetry = status ? !NON_RETRYABLE_STATUS.has(status) : true;
  const message = getDenoDeployErrorMessage(error);

  return new SecretSyncError({ error, secretKey, shouldRetry, message });
};

const getApp = async (secretSync: TDenoDeploySyncWithCredentials): Promise<TDenoDeployApp> => {
  const {
    destinationConfig: { appId, appSlug },
    connection: {
      credentials: { accessToken }
    }
  } = secretSync;

  try {
    const { data } = await request.get<TDenoDeployApp>(`${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps/${appId}`, {
      headers: getDenoDeployAuthHeaders(accessToken)
    });
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      throw new SecretSyncError({
        message: `Deno Deploy app '${appSlug}' was not found. Verify the app still exists and the access token can access it.`,
        shouldRetry: false
      });
    }
    throw toDenoDeploySyncError(error);
  }
};

const patchEnvVars = async (secretSync: TDenoDeploySyncWithCredentials, envVars: TDenoDeployEnvVarUpdate[]) => {
  if (envVars.length === 0) return;

  const {
    destinationConfig: { appId },
    connection: {
      credentials: { accessToken }
    }
  } = secretSync;

  try {
    await request.patch(
      `${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps/${appId}`,
      { env_vars: envVars },
      { headers: getDenoDeployAuthHeaders(accessToken) }
    );
  } catch (error) {
    throw toDenoDeploySyncError(error);
  }
};

const assertValidSecretNames = (keys: string[]) => {
  const invalidKeys = keys.filter((key) => !isDenoDeploySecretName(key));
  if (invalidKeys.length === 0) return;

  throw new SecretSyncError({
    secretKey: invalidKeys[0],
    shouldRetry: false,
    message: `Secret name '${invalidKeys[0]}' is not a valid Deno Deploy environment variable name. ${DENO_DEPLOY_SECRET_NAME_RULE}`
  });
};

const ownedVars = (envVars: TDenoDeployEnvVar[] | undefined, context: DenoDeploySyncContext) =>
  (envVars ?? []).filter((envVar) => isExactDenoDeployContextMatch(envVar.contexts, context));

export const DenoDeploySyncFns = {
  syncSecrets: async (secretSync: TDenoDeploySyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const environmentSlug = secretSync.environment?.slug || "";
    const { disableSecretDeletion, keySchema } = secretSync.syncOptions;
    const { context, appSlug } = secretSync.destinationConfig;
    const contexts = destinationContexts(context);

    const entriesToWrite = Object.entries(secretMap).filter(([, secret]) => secret.value !== "");
    assertValidSecretNames(entriesToWrite.map(([key]) => key));

    const app = await getApp(secretSync);
    const existingVars = app.env_vars ?? [];
    const writeKeys = new Set(entriesToWrite.map(([key]) => key));

    for (const envVar of existingVars) {
      if (
        writeKeys.has(envVar.key) &&
        !isExactDenoDeployContextMatch(envVar.contexts, context) &&
        overlapsDenoDeployContext(envVar.contexts, context)
      ) {
        throw new SecretSyncError({
          secretKey: envVar.key,
          shouldRetry: false,
          message: `Deno Deploy app '${appSlug}' already has an environment variable named '${envVar.key}' for overlapping contexts. Change the destination context or remove the existing variable in Deno Deploy before syncing.`
        });
      }
    }

    const updates: TDenoDeployEnvVarUpdate[] = entriesToWrite.map(([key, secret]) => ({
      key,
      value: secret.value,
      secret: true,
      contexts
    }));

    if (!disableSecretDeletion) {
      for (const envVar of ownedVars(existingVars, context)) {
        if (!(envVar.key in secretMap) && matchesSchema(envVar.key, environmentSlug, keySchema)) {
          updates.push({ id: envVar.id, delete: true });
        }
      }
    }

    await patchEnvVars(secretSync, updates);
  },

  getSecrets: async (secretSync: TDenoDeploySyncWithCredentials): Promise<TSecretMap> => {
    const { context } = secretSync.destinationConfig;
    const app = await getApp(secretSync);
    const imported: TSecretMap = {};

    for (const envVar of ownedVars(app.env_vars, context)) {
      if (!envVar.secret && envVar.value !== undefined) {
        imported[envVar.key] = { value: envVar.value };
      }
    }

    return imported;
  },

  removeSecrets: async (secretSync: TDenoDeploySyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const { context } = secretSync.destinationConfig;
    const app = await getApp(secretSync);

    const updates: TDenoDeployEnvVarUpdate[] = [];
    for (const envVar of ownedVars(app.env_vars, context)) {
      if (envVar.key in secretMap) {
        updates.push({ id: envVar.id, delete: true });
      }
    }

    await patchEnvVars(secretSync, updates);
  }
};
