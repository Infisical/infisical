/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, GatewayTransportError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import {
  coolifyRequest,
  CoolifyResourceType,
  getCoolifyErrorMessage,
  resolveCoolifyGateway,
  TCoolifyConnection,
  TCoolifyGatewayDeps
} from "@app/services/app-connection/coolify";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { TSecretMap } from "../secret-sync-types";
import { COOLIFY_ENV_VAR_NAME_RULE, isManagedByCoolify, isValidCoolifyEnvVarName } from "./coolify-sync-constants";
import { CoolifySyncScope } from "./coolify-sync-enums";
import { TCoolifyEnvVar, TCoolifyEnvVarUpsert, TCoolifySyncWithCredentials } from "./coolify-sync-types";

type TCoolifyEnvVarsApi = { connection: TCoolifyConnection; envsPath: string; deps: TCoolifyGatewayDeps };

type TGatewayV2Service = Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
type TGatewayPoolService = Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;

const COOLIFY_RESOURCE_PATH: Record<CoolifyResourceType, string> = {
  [CoolifyResourceType.Application]: "applications",
  [CoolifyResourceType.Service]: "services",
  [CoolifyResourceType.Database]: "databases"
};

const COOLIFY_UPSERT_BATCH_SIZE = 100;

const isInScope = (envVar: TCoolifyEnvVar, scope: CoolifySyncScope) =>
  Boolean(envVar.is_preview) === (scope === CoolifySyncScope.Preview);

const getOwnedEnvVars = (
  { environment, destinationConfig: { scope }, syncOptions: { keySchema } }: TCoolifySyncWithCredentials,
  envVars: TCoolifyEnvVar[]
) =>
  envVars.filter(
    (envVar) =>
      isInScope(envVar, scope) &&
      !isManagedByCoolify(envVar.key) &&
      matchesSchema(envVar.key, environment?.slug || "", keySchema)
  );

const toSyncError = (error: unknown, message: string, secretKey?: string) => {
  // A gateway that is missing or not allowed is a configuration problem a retry will not fix, while a
  // tunnel that could not be opened never reached Coolify and is left to the queue's retries
  if (error instanceof BadRequestError && !(error instanceof GatewayTransportError)) {
    return new SecretSyncError({ message: error.message, secretKey, shouldRetry: false });
  }

  const status = isAxiosError(error) ? error.response?.status : undefined;

  // Retrying a request Coolify refused only delays the failure, and repeated 401s and 403s get the token
  // blocked by Coolify's failed request limit
  return new SecretSyncError({
    message: `${message}: ${getCoolifyErrorMessage(error, "unknown error")}`,
    secretKey,
    shouldRetry: !(status && [400, 401, 403, 404, 422].includes(status))
  });
};

const getCoolifyEnvVarsApi = async (
  { connection, destinationConfig: { resourceType, resourceId } }: TCoolifySyncWithCredentials,
  gatewayV2Service: TGatewayV2Service,
  gatewayPoolService: TGatewayPoolService
): Promise<TCoolifyEnvVarsApi> => {
  try {
    return {
      connection: await resolveCoolifyGateway(connection, gatewayPoolService),
      envsPath: `/${COOLIFY_RESOURCE_PATH[resourceType]}/${encodeURIComponent(resourceId)}/envs`,
      deps: { gatewayV2Service }
    };
  } catch (error) {
    throw toSyncError(error, "Failed to resolve the Coolify connection's gateway");
  }
};

// Not paginated; Coolify returns every variable of the resource in one response
const listCoolifyEnvVars = async ({ connection, envsPath, deps }: TCoolifyEnvVarsApi) => {
  try {
    return await coolifyRequest<TCoolifyEnvVar[]>(connection, { method: "GET", path: envsPath }, deps);
  } catch (error) {
    throw toSyncError(error, "Failed to list Coolify environment variables");
  }
};

// Coolify upserts a batch by key one variable at a time, so batches are kept small enough to finish within the
// request timeout, and a failure part way through leaves the earlier variables written
const upsertCoolifyEnvVars = async (
  { connection, envsPath, deps }: TCoolifyEnvVarsApi,
  envVars: TCoolifyEnvVarUpsert[]
) => {
  try {
    for (const batch of chunkArray(envVars, COOLIFY_UPSERT_BATCH_SIZE)) {
      await coolifyRequest(connection, { method: "PATCH", path: `${envsPath}/bulk`, data: { data: batch } }, deps);
    }
  } catch (error) {
    throw toSyncError(error, "Failed to update Coolify environment variables");
  }
};

const deleteCoolifyEnvVar = async ({ connection, envsPath, deps }: TCoolifyEnvVarsApi, envVar: TCoolifyEnvVar) => {
  try {
    await coolifyRequest(
      connection,
      { method: "DELETE", path: `${envsPath}/${encodeURIComponent(envVar.uuid)}` },
      deps
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return;

    throw toSyncError(error, `Failed to delete Coolify environment variable '${envVar.key}'`, envVar.key);
  }
};

// Coolify copies a production variable of an application into its preview variables when it creates it, and never
// copies a later value, which would hand production secrets to the code of a pull request. New variables are created
// with this placeholder and the preview variables holding it deleted before any value is written, so a run that stops
// part way leaves only the placeholder in preview deployments, for the next run to delete.
const COOLIFY_PLACEHOLDER_VALUE = "infisical-sync-pending";

const createProductionEnvVarsWithoutPreviewCopies = async (
  api: TCoolifyEnvVarsApi,
  envVars: TCoolifyEnvVar[],
  newKeys: string[]
) => {
  if (newKeys.length) {
    await upsertCoolifyEnvVars(
      api,
      newKeys.map((key) => ({ key, value: COOLIFY_PLACEHOLDER_VALUE, is_literal: true }))
    );
  }

  const copies = (newKeys.length ? await listCoolifyEnvVars(api) : envVars).filter(
    (envVar) => envVar.is_preview && envVar.value === COOLIFY_PLACEHOLDER_VALUE
  );

  for (const copy of copies) {
    await deleteCoolifyEnvVar(api, copy);
  }
};

export const CoolifySyncFns = {
  async getSecrets(
    secretSync: TCoolifySyncWithCredentials,
    gatewayV2Service: TGatewayV2Service,
    gatewayPoolService: TGatewayPoolService
  ): Promise<TSecretMap> {
    const api = await getCoolifyEnvVarsApi(secretSync, gatewayV2Service, gatewayPoolService);
    const envVars = getOwnedEnvVars(secretSync, await listCoolifyEnvVars(api));

    // Leaving a variable out of the import would get it deleted as stale by the sync that follows
    const unreadable = envVars.find((envVar) => envVar.value === undefined);
    if (unreadable) {
      throw new SecretSyncError({
        secretKey: unreadable.key,
        shouldRetry: false,
        message: `Coolify did not return the value of '${unreadable.key}'. Locked variables can't be read through the Coolify API, and other values need an API token with the read:sensitive permission whose owner is a team admin.`
      });
    }

    return Object.fromEntries(envVars.map((envVar) => [envVar.key, { value: envVar.value ?? "" }]));
  },

  async syncSecrets(
    secretSync: TCoolifySyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: TGatewayV2Service,
    gatewayPoolService: TGatewayPoolService
  ) {
    const secretMap = payload.flatten();
    const {
      destinationConfig: { resourceType, scope },
      syncOptions: { disableSecretDeletion }
    } = secretSync;

    // Rejected up front so the message names every offending key, instead of Coolify refusing the batch on the first
    const invalidKeys = Object.keys(secretMap).filter((key) => !isValidCoolifyEnvVarName(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid Coolify environment variable name: ${invalidKeys.join(", ")}. ${COOLIFY_ENV_VAR_NAME_RULE}`
      });
    }

    const api = await getCoolifyEnvVarsApi(secretSync, gatewayV2Service, gatewayPoolService);
    const envVars = await listCoolifyEnvVars(api);

    const isPreview = scope === CoolifySyncScope.Preview;
    const existingVars = new Map(
      envVars.filter((envVar) => isInScope(envVar, scope)).map((envVar) => [envVar.key, envVar])
    );

    const upserts: TCoolifyEnvVarUpsert[] = [];
    for (const [key, { value }] of Object.entries(secretMap)) {
      const existing = existingVars.get(key);

      // Coolify stores an empty value as null, and without the literal flag it resolves a value that starts with $
      // as a reference to another variable
      if (!existing || existing.value !== (value || null) || !existing.is_literal) {
        upserts.push({ key, value, is_literal: true, ...(isPreview && { is_preview: true }) });
      }
    }

    if (resourceType === CoolifyResourceType.Application && !isPreview) {
      const keysWithVars = new Set(envVars.map(({ key }) => key));
      // A key that already has a preview variable gets no copy
      await createProductionEnvVarsWithoutPreviewCopies(
        api,
        envVars,
        upserts.map(({ key }) => key).filter((key) => !keysWithVars.has(key))
      );
    }

    await upsertCoolifyEnvVars(api, upserts);

    if (disableSecretDeletion) return;

    for (const envVar of getOwnedEnvVars(secretSync, envVars)) {
      if (!Object.hasOwn(secretMap, envVar.key)) await deleteCoolifyEnvVar(api, envVar);
    }
  },

  async removeSecrets(
    secretSync: TCoolifySyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: TGatewayV2Service,
    gatewayPoolService: TGatewayPoolService
  ) {
    const secretMap = payload.flatten();
    const { scope } = secretSync.destinationConfig;
    const api = await getCoolifyEnvVarsApi(secretSync, gatewayV2Service, gatewayPoolService);
    const envVars = await listCoolifyEnvVars(api);

    for (const envVar of envVars) {
      if (isInScope(envVar, scope) && !isManagedByCoolify(envVar.key) && Object.hasOwn(secretMap, envVar.key)) {
        await deleteCoolifyEnvVar(api, envVar);
      }
    }
  }
};
