import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const CLOUDFLARE_UNDEPLOYED_VERSION_ERROR_CODE = 10215;

type TCloudflareErrorResponse = {
  errors?: Array<{ code: number; message: string }>;
};

type TCloudflareSecretMetadata = {
  key: string;
  type: string;
};

const throwOnUndeployedVersionError = (err: unknown) => {
  if (
    err instanceof AxiosError &&
    (err.response?.data as TCloudflareErrorResponse)?.errors?.some(
      (e) => e.code === CLOUDFLARE_UNDEPLOYED_VERSION_ERROR_CODE
    )
  ) {
    throw new BadRequestError({
      message:
        "Cloudflare rejected the secret update because the latest Worker version is not deployed; deploy the latest Worker version, then retry the secret sync."
    });
  }

  throw err;
};

const getSecretKeys = async (
  secretSync: TCloudflareWorkersSyncWithCredentials
): Promise<TCloudflareSecretMetadata[]> => {
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

  const nonSecretBindings = (settingsResponse.data.result.bindings || [])
    .filter((b) => SYNCABLE_BINDING_TYPES.has(b.type))
    .map((b) => ({ key: b.name, type: b.type }));

  const secretKeySet = new Set(secrets.map((s) => s.key));
  const uniqueNonSecretBindings = nonSecretBindings.filter((v) => !secretKeySet.has(v.key));

  return [...secrets, ...uniqueNonSecretBindings];
};

export const CloudflareWorkersSyncFns = {
  syncSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId }
    } = secretSync;

    const existingSecrets = await getSecretKeys(secretSync);
    const existingSecretsMap = Object.fromEntries(existingSecrets.map(({ key, type }) => [key, type]));
    const secretMapKeys = new Set(Object.keys(secretMap));

    const bindingEntries: Array<[string, { value: string }]> = [];
    const secretEntries: Array<[string, { value: string }]> = [];

    for (const [key, val] of Object.entries(secretMap)) {
      const existingType = existingSecretsMap[key];
      if (existingType && existingType !== "secret_text") {
        bindingEntries.push([key, val]);
      } else {
        secretEntries.push([key, val]);
      }
    }

    try {
      /* eslint-disable no-await-in-loop */
      for (const [key, val] of secretEntries) {
        await delayMs(Math.max(0, applyJitter(100, 200)));
        await request.put(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets`,
          { name: key, text: val.value, type: "secret_text" },
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
      /* eslint-enable no-await-in-loop */

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
        const updatedBindings = settingsData.result.bindings.map((binding) => {
          if (binding.type !== "secret_text" && updatedBindingMap[binding.name] !== undefined) {
            const newValue = updatedBindingMap[binding.name].value;
            if (binding.type === "json") {
              try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                return { ...binding, json: JSON.parse(newValue) };
              } catch {
                throw new BadRequestError({
                  message: `"${binding.name}" already exists in cloudflare as a JSON variable: the value you provided is not valid JSON`
                });
              }
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

        await request.patch(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
      }
    } catch (err) {
      throwOnUndeployedVersionError(err);
    }

    if (!secretSync.syncOptions.disableSecretDeletion) {
      const secretsToDelete = existingSecrets.filter((existingSecret) => {
        const isManagedBySchema = matchesSchema(
          existingSecret.key,
          secretSync.environment?.slug || "",
          secretSync.syncOptions.keySchema
        );
        const isInNewSecretMap = secretMapKeys.has(existingSecret.key);
        return !isInNewSecretMap && isManagedBySchema;
      });

      const secretTypeToDelete = secretsToDelete.filter((s) => s.type === "secret_text");
      const bindingTypeToDelete = secretsToDelete.filter((s) => s.type !== "secret_text");

      try {
        /* eslint-disable no-await-in-loop */
        for (const secret of secretTypeToDelete) {
          await delayMs(Math.max(0, applyJitter(100, 200)));
          await request.delete(
            `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets/${secret.key}`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`
              }
            }
          );
        }
        /* eslint-enable no-await-in-loop */

        if (bindingTypeToDelete.length > 0) {
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
        }
      } catch (err) {
        throwOnUndeployedVersionError(err);
      }
    }
  },

  getSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  removeSecrets: async (secretSync: TCloudflareWorkersSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scriptId }
    } = secretSync;

    const existingSecretNames = await getSecretKeys(secretSync);
    const secretMapToRemoveKeys = new Set(Object.keys(secretMap));

    const secretsToRemove = existingSecretNames.filter((existingSecret) => {
      const isManagedBySchema = matchesSchema(
        existingSecret.key,
        secretSync.environment?.slug || "",
        secretSync.syncOptions.keySchema
      );
      return secretMapToRemoveKeys.has(existingSecret.key) && isManagedBySchema;
    });

    const secretTypeToRemove = secretsToRemove.filter((s) => s.type === "secret_text");
    const bindingTypeToRemove = secretsToRemove.filter((s) => s.type !== "secret_text");

    try {
      /* eslint-disable no-await-in-loop */
      for (const secret of secretTypeToRemove) {
        await delayMs(Math.max(0, applyJitter(100, 200)));
        await request.delete(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/secrets/${secret.key}`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
      }
      /* eslint-enable no-await-in-loop */

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

        await request.patch(
          `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/scripts/${scriptId}/settings`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`
            }
          }
        );
      }
    } catch (err) {
      throwOnUndeployedVersionError(err);
    }
  }
};
