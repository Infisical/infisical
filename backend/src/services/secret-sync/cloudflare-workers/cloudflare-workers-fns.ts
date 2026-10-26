import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { CloudflareWorkersVariableType } from "./cloudflare-workers-constants";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const CLOUDFLARE_UNDEPLOYED_VERSION_ERROR_CODE = 10215;
const CLOUDFLARE_SECRET_TYPE = "secret_text";
const VARIABLE_BINDING_TYPES = new Set<string>(Object.values(CloudflareWorkersVariableType));
// Cloudflare rejects secrets-bulk requests carrying more than 100 secrets (error code 100160).
const CLOUDFLARE_BULK_SECRETS_LIMIT = 100;

type TCloudflareApiResponse = {
  result?: unknown;
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: string[];
};

type TCloudflareSecretMetadata = {
  key: string;
  type: string;
};

const $validateJsonBindings = (
  bindings: Array<{ type: string; name: string }>,
  updatedBindingMap: Record<string, { value: string }>
) => {
  const invalidJsonBindings: string[] = [];
  for (const binding of bindings) {
    if (binding.type === "json" && updatedBindingMap[binding.name] !== undefined) {
      try {
        JSON.parse(updatedBindingMap[binding.name].value);
      } catch {
        invalidJsonBindings.push(binding.name);
      }
    }
  }
  if (invalidJsonBindings.length > 0) {
    throw new BadRequestError({
      message: `The following bindings already exist in Cloudflare as JSON variables but the values provided are not valid JSON: ${invalidJsonBindings.join(", ")}`
    });
  }
};

const $getCloudflareErrors = (data: unknown): Array<{ code: number; message: string }> => {
  if (typeof data !== "object" || data === null) return [];
  const { errors } = data as TCloudflareApiResponse;
  if (!Array.isArray(errors)) return [];
  return errors.filter((error) => typeof error?.message === "string");
};

const $throwCloudflareError = (
  errors: Array<{ code: number; message: string }>,
  cause: unknown,
  secretKey?: string
): never => {
  const message = errors.some((e) => e.code === CLOUDFLARE_UNDEPLOYED_VERSION_ERROR_CODE)
    ? "Cloudflare rejected the secret update because the latest Worker version is not deployed; deploy the latest Worker version, then retry the secret sync."
    : errors.map((e) => e.message).join(". ");

  throw new SecretSyncError({
    message,
    error: cause,
    secretKey,
    shouldRetry: false
  });
};

const throwOnCloudflareRequestError = (err: unknown, secretKey?: string): never => {
  if (err instanceof AxiosError) {
    const errors = $getCloudflareErrors(err.response?.data);
    if (errors.length > 0) {
      $throwCloudflareError(errors, err, secretKey);
    }
  }

  throw err;
};

const $validateCloudflareResponse = (data: unknown) => {
  if (typeof data !== "object" || data === null) return;
  if ((data as TCloudflareApiResponse).success === false) {
    const errors = $getCloudflareErrors(data);
    if (errors.length > 0) {
      $throwCloudflareError(errors, undefined);
    }
    throw new SecretSyncError({
      message: "Cloudflare returned an unsuccessful response without error details.",
      shouldRetry: false
    });
  }
};

type TCloudflareBindings = {
  secrets: TCloudflareSecretMetadata[];
  nonSecretBindings: TCloudflareSecretMetadata[];
};

const getCloudflareBindings = async (
  secretSync: TCloudflareWorkersSyncWithCredentials
): Promise<TCloudflareBindings> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiToken, accountId }
    }
  } = secretSync;

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json"
  };

  const [secretsResponse, settingsResponse] = await Promise.all([
    request.get<{
      result: Array<{ name: string; type: string }>;
    }>(
      `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${destinationConfig.scriptId}/secrets`,
      { headers }
    ),
    request.get<{
      result: { bindings: Array<{ type: string; name: string; text?: string }> };
    }>(
      `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${destinationConfig.scriptId}/settings`,
      { headers }
    )
  ]);

  const secrets = secretsResponse.data.result.map((s) => ({ key: s.name, type: s.type }));

  const SYNCABLE_BINDING_TYPES = new Set(["plain_text", "json"]);

  const secretKeySet = new Set(secrets.map((s) => s.key));
  const nonSecretBindings = (settingsResponse.data.result.bindings || [])
    .filter((b) => SYNCABLE_BINDING_TYPES.has(b.type) && !secretKeySet.has(b.name))
    .map((b) => ({ key: b.name, type: b.type }));

  // We need to know both types because cloudflare prevents secrets and variables (plaintext or JSON)
  // to have the same name.
  return { secrets, nonSecretBindings };
};

const VARIABLE_TYPE_LABELS: Record<string, string> = {
  [CloudflareWorkersVariableType.Secret]: "secret",
  [CloudflareWorkersVariableType.Text]: "text",
  [CloudflareWorkersVariableType.Json]: "JSON"
};

// Changing a variable's type can break the Worker, since a JSON variable reaches it as a parsed object, or
// expose a secret's value in the dashboard. A sync never changes one; it fails before writing anything.
const $throwOnTypeConflicts = (conflicts: Array<{ name: string; type: string }>, fix: string) => {
  if (conflicts.length === 0) return;

  throw new SecretSyncError({
    message: `The following secrets already exist on the Cloudflare Worker as a different type: ${conflicts
      .map(({ name, type }) => `${name} (${VARIABLE_TYPE_LABELS[type]})`)
      .join(", ")}. Infisical doesn't change a variable's type, so nothing was synced. ${fix}`,
    shouldRetry: false
  });
};

// A text or JSON sync only owns variables of its type, so syncs of different types can share a Worker.
const $getManagedBindings = (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  { secrets, nonSecretBindings }: TCloudflareBindings
) => {
  const { variableType = CloudflareWorkersVariableType.Secret } = secretSync.destinationConfig;

  if (variableType !== CloudflareWorkersVariableType.Secret) {
    return nonSecretBindings.filter((binding) => binding.type === variableType);
  }

  return secretSync.syncOptions.syncNonSecretBindings ? [...secrets, ...nonSecretBindings] : secrets;
};

// Text and JSON variables are bindings in the Worker's settings, which take the full binding list. One
// PATCH therefore creates and updates them and deletes the ones no longer in Infisical.
const $syncVariableBindings = async (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  variableType: CloudflareWorkersVariableType.Text | CloudflareWorkersVariableType.Json
) => {
  const {
    connection: {
      credentials: { apiToken, accountId }
    },
    destinationConfig: { scriptId },
    syncOptions: { disableSecretDeletion, keySchema }
  } = secretSync;

  const variableBindings: Array<{ type: string; name: string; text?: string; json?: unknown }> = [];
  const invalidJsonKeys: string[] = [];

  for (const [name, { value }] of Object.entries(secretMap)) {
    if (variableType === CloudflareWorkersVariableType.Text) {
      variableBindings.push({ type: variableType, name, text: value });
    } else {
      try {
        variableBindings.push({ type: variableType, name, json: JSON.parse(value) as unknown });
      } catch {
        invalidJsonKeys.push(name);
      }
    }
  }

  if (invalidJsonKeys.length > 0) {
    throw new SecretSyncError({
      message: `The following secrets are not valid JSON, so they cannot be synced as Cloudflare Workers JSON variables: ${invalidJsonKeys.join(", ")}. Fix their values in Infisical or change the sync's variable type.`,
      shouldRetry: false
    });
  }

  const secretMapKeys = new Set(Object.keys(secretMap));
  const isDeleted = (binding: { type: string; name: string }) =>
    !disableSecretDeletion &&
    binding.type === variableType &&
    matchesSchema(binding.name, secretSync.environment?.slug || "", keySchema);

  const settingsUrl = `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`;

  try {
    const { data: settingsData } = await request.get<{
      result: { bindings: Array<{ type: string; name: string; text?: string; json?: string }> };
    }>(settingsUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });

    const existingBindings = settingsData.result.bindings ?? [];

    const conflictingKeys = existingBindings
      .filter((binding) => secretMapKeys.has(binding.name) && !VARIABLE_BINDING_TYPES.has(binding.type))
      .map((binding) => binding.name);

    if (conflictingKeys.length > 0) {
      throw new SecretSyncError({
        message: `The following secrets have the same name as another binding on the Cloudflare Worker, such as a KV namespace or a service: ${conflictingKeys.join(", ")}. Rename the secrets in Infisical, or use a key schema to change their names in Cloudflare.`,
        shouldRetry: false
      });
    }

    $throwOnTypeConflicts(
      existingBindings.filter((binding) => secretMapKeys.has(binding.name) && binding.type !== variableType),
      "Delete them in Cloudflare or change the sync's variable type, then sync again."
    );

    const bindings = [
      ...existingBindings.filter((binding) => !secretMapKeys.has(binding.name) && !isDeleted(binding)),
      ...variableBindings
    ];

    const formData = new FormData();
    formData.append("settings", new Blob([JSON.stringify({ bindings })], { type: "application/json" }));

    const { data: settingsPatchData } = await request.patch<TCloudflareApiResponse>(settingsUrl, formData, {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    });
    $validateCloudflareResponse(settingsPatchData);
  } catch (err) {
    throwOnCloudflareRequestError(err);
  }
};

export const CloudflareWorkersSyncFns = {
  syncSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId, variableType }
    } = secretSync;

    if (variableType === CloudflareWorkersVariableType.Text || variableType === CloudflareWorkersVariableType.Json) {
      await $syncVariableBindings(secretSync, secretMap, variableType);
      return;
    }

    const shouldSyncNonSecretBindings = Boolean(secretSync.syncOptions.syncNonSecretBindings);
    const cloudflareBindings = await getCloudflareBindings(secretSync);

    const existingSecrets = $getManagedBindings(secretSync, cloudflareBindings);

    const nonSecretBindingKeys = new Set(cloudflareBindings.nonSecretBindings.map((b) => b.key));
    const existingSecretsMap = Object.fromEntries(existingSecrets.map(({ key, type }) => [key, type]));
    const secretMapKeys = new Set(Object.keys(secretMap));

    // With shouldSyncNonSecretBindings on, same-name plaintext and JSON variables are updated as they are.
    // Otherwise the sync fails rather than change their type, except a sync created before the type could be
    // chosen (no variableType), which keeps skipping them as it always has.
    if (!shouldSyncNonSecretBindings && variableType) {
      $throwOnTypeConflicts(
        cloudflareBindings.nonSecretBindings
          .filter((binding) => secretMapKeys.has(binding.key))
          .map(({ key, type }) => ({ name: key, type })),
        'Delete them in Cloudflare, change the sync\'s variable type, or turn on "Sync plaintext and JSON variables" to update them as they are.'
      );
    }

    const syncableEntries = Object.entries(secretMap).filter(
      ([key]) => shouldSyncNonSecretBindings || !nonSecretBindingKeys.has(key)
    );

    const bindingEntries: Array<[string, { value: string }]> = [];
    const secretEntries: Array<[string, { value: string }]> = [];

    for (const [key, val] of syncableEntries) {
      const existingType = existingSecretsMap[key];
      if (existingType && existingType !== CLOUDFLARE_SECRET_TYPE) {
        bindingEntries.push([key, val]);
      } else {
        secretEntries.push([key, val]);
      }
    }

    try {
      if (bindingEntries.length > 0) {
        const { data: settingsData } = await request.get<{
          result: { bindings: Array<{ type: string; name: string; text?: string; json?: string }> };
        }>(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              Accept: "application/json"
            }
          }
        );

        const updatedBindingMap = Object.fromEntries(bindingEntries);

        $validateJsonBindings(settingsData.result.bindings, updatedBindingMap);

        const updatedBindings = settingsData.result.bindings.map((binding) => {
          if (binding.type !== CLOUDFLARE_SECRET_TYPE && updatedBindingMap[binding.name] !== undefined) {
            const newValue = updatedBindingMap[binding.name].value;
            if (binding.type === "json") {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              return { ...binding, json: JSON.parse(newValue) };
            }
            return { ...binding, text: newValue };
          }
          return binding;
        });

        const formData = new FormData();
        formData.append(
          "settings",
          new Blob([JSON.stringify({ bindings: updatedBindings })], { type: "application/json" })
        );

        const { data: settingsPatchData } = await request.patch<TCloudflareApiResponse>(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
        $validateCloudflareResponse(settingsPatchData);
      }

      // Build the bulk secrets payload using JSON Merge Patch (RFC 7396):
      // - present keys with an object value are created/updated
      // - keys set to null are deleted
      // - omitted keys are left unchanged
      // Null-prototype object so secret names like "__proto__" are stored as regular properties.
      const bulkSecrets: Record<string, { name: string; text: string; type: string } | null> = Object.create(
        null
      ) as Record<string, { name: string; text: string; type: string } | null>;

      for (const [key, val] of secretEntries) {
        bulkSecrets[key] = { name: key, text: val.value, type: CLOUDFLARE_SECRET_TYPE };
      }

      if (!secretSync.syncOptions.disableSecretDeletion) {
        const secretTypeToDelete = existingSecrets.filter((existingSecret) => {
          if (existingSecret.type !== CLOUDFLARE_SECRET_TYPE) return false;
          const isManagedBySchema = matchesSchema(
            existingSecret.key,
            secretSync.environment?.slug || "",
            secretSync.syncOptions.keySchema
          );
          return !secretMapKeys.has(existingSecret.key) && isManagedBySchema;
        });

        for (const secret of secretTypeToDelete) {
          bulkSecrets[secret.key] = null;
        }
      }

      for await (const batch of chunkArray(Object.entries(bulkSecrets), CLOUDFLARE_BULK_SECRETS_LIMIT)) {
        const batchSecrets = Object.create(null) as typeof bulkSecrets;
        for (const [key, val] of batch) {
          batchSecrets[key] = val;
        }

        const [firstSecretKey] = batch[0];
        try {
          const { data } = await request.patch<TCloudflareApiResponse>(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets-bulk`,
            { secrets: batchSecrets },
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json"
              }
            }
          );
          $validateCloudflareResponse(data);
        } catch (err) {
          throwOnCloudflareRequestError(err, firstSecretKey);
        }
      }
    } catch (err) {
      throwOnCloudflareRequestError(err);
    }

    if (!secretSync.syncOptions.disableSecretDeletion) {
      const bindingTypeToDelete = existingSecrets.filter((existingSecret) => {
        if (existingSecret.type === CLOUDFLARE_SECRET_TYPE) return false;
        const isManagedBySchema = matchesSchema(
          existingSecret.key,
          secretSync.environment?.slug || "",
          secretSync.syncOptions.keySchema
        );
        return !secretMapKeys.has(existingSecret.key) && isManagedBySchema;
      });

      if (bindingTypeToDelete.length > 0) {
        try {
          const bindingKeysToDelete = new Set(bindingTypeToDelete.map((b) => b.key));

          const { data: settingsData } = await request.get<{
            result: { bindings: Array<{ type: string; name: string; text?: string; json?: string }> };
          }>(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                Accept: "application/json"
              }
            }
          );

          const filteredBindings = settingsData.result.bindings.filter(
            (binding) => !bindingKeysToDelete.has(binding.name)
          );

          const formData = new FormData();
          formData.append(
            "settings",
            new Blob([JSON.stringify({ bindings: filteredBindings })], { type: "application/json" })
          );

          await request.patch(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
            formData,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`
              }
            }
          );
        } catch (err) {
          throwOnCloudflareRequestError(err);
        }
      }
    }
  },

  getSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, payload: TSecretSyncPayload) => {
    const secretMap = payload.flatten();
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId }
    } = secretSync;

    const existingSecretNames = $getManagedBindings(secretSync, await getCloudflareBindings(secretSync));

    const secretMapToRemoveKeys = new Set(Object.keys(secretMap));

    const secretsToRemove = existingSecretNames.filter((existingSecret) => {
      const isManagedBySchema = matchesSchema(
        existingSecret.key,
        secretSync.environment?.slug || "",
        secretSync.syncOptions.keySchema
      );
      return secretMapToRemoveKeys.has(existingSecret.key) && isManagedBySchema;
    });

    const secretTypeToRemove = secretsToRemove.filter((s) => s.type === CLOUDFLARE_SECRET_TYPE);
    const bindingTypeToRemove = secretsToRemove.filter((s) => s.type !== CLOUDFLARE_SECRET_TYPE);

    try {
      for await (const batch of chunkArray(secretTypeToRemove, CLOUDFLARE_BULK_SECRETS_LIMIT)) {
        // Null-prototype object so secret names like "__proto__" are stored as regular properties.
        const bulkSecrets: Record<string, null> = Object.create(null) as Record<string, null>;
        for (const secret of batch) {
          bulkSecrets[secret.key] = null;
        }

        const firstSecretKey = batch[0].key;
        try {
          const { data } = await request.patch<TCloudflareApiResponse>(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets-bulk`,
            { secrets: bulkSecrets },
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json"
              }
            }
          );
          $validateCloudflareResponse(data);
        } catch (err) {
          throwOnCloudflareRequestError(err, firstSecretKey);
        }
      }

      if (bindingTypeToRemove.length > 0) {
        const bindingKeysToRemove = new Set(bindingTypeToRemove.map((b) => b.key));

        const { data: settingsData } = await request.get<{
          result: { bindings: Array<{ type: string; name: string; text?: string; json?: string }> };
        }>(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              Accept: "application/json"
            }
          }
        );

        const filteredBindings = settingsData.result.bindings.filter(
          (binding) => !bindingKeysToRemove.has(binding.name)
        );

        const formData = new FormData();
        formData.append(
          "settings",
          new Blob([JSON.stringify({ bindings: filteredBindings })], { type: "application/json" })
        );

        const { data: settingsPatchData } = await request.patch<TCloudflareApiResponse>(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
        $validateCloudflareResponse(settingsPatchData);
      }
    } catch (err) {
      throwOnCloudflareRequestError(err);
    }
  }
};
