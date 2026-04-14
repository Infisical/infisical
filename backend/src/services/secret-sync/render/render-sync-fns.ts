/* eslint-disable no-await-in-loop */
import { AxiosRequestConfig, isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { RenderSyncScope } from "./render-sync-enums";
import { TRenderSecret, TRenderSyncWithCredentials } from "./render-sync-types";

const MAX_RETRIES = 5;

const retrySleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 60000);
  });

const makeRequestWithRetry = async <T>(requestFn: () => Promise<T>, attempt = 0): Promise<T> => {
  try {
    return await requestFn();
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
      await retrySleep();
      return await makeRequestWithRetry(requestFn, attempt + 1);
    }
    throw error;
  }
};

async function getSecrets(input: { destination: TRenderSyncWithCredentials["destinationConfig"]; token: string }) {
  const req: AxiosRequestConfig = {
    baseURL: `${IntegrationUrls.RENDER_API_URL}/v1`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.token}`,
      Accept: "application/json"
    }
  };

  switch (input.destination.scope) {
    case RenderSyncScope.Service: {
      req.url = `/services/${input.destination.serviceId}/env-vars`;

      const allSecrets: TRenderSecret[] = [];
      let cursor: string | undefined;

      do {
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        const { data } = await makeRequestWithRetry(() =>
          request.request<
            {
              envVar: {
                key: string;
                value: string;
              };
              cursor: string;
            }[]
          >({
            ...req,
            params: {
              cursor
            }
          })
        );

        const secrets = data.map((item) => ({
          key: item.envVar.key,
          value: item.envVar.value
        }));

        allSecrets.push(...secrets);

        if (data.length > 0 && data[data.length - 1]?.cursor) {
          cursor = data[data.length - 1].cursor;
        } else {
          cursor = undefined;
        }
      } while (cursor);

      return allSecrets;
    }
    case RenderSyncScope.EnvironmentGroup: {
      req.url = `/env-groups/${input.destination.environmentGroupId}`;

      const res = await makeRequestWithRetry(() =>
        request.request<{
          envVars: {
            key: string;
            value: string;
          }[];
        }>(req)
      );

      return res.data.envVars.map((item) => ({
        key: item.key,
        value: item.value
      }));
    }
    default:
      throw new BadRequestError({ message: "Unknown render sync destination scope" });
  }
}

const getRenderEnvironmentSecrets = async (secretSync: TRenderSyncWithCredentials): Promise<TRenderSecret[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  const secrets = await getSecrets({
    destination: destinationConfig,
    token: apiKey
  });

  return secrets;
};

const batchUpdateEnvironmentSecrets = async (
  secretSync: TRenderSyncWithCredentials,
  envVars: Array<{ key: string; value: string }>
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  const req: AxiosRequestConfig = {
    baseURL: `${IntegrationUrls.RENDER_API_URL}/v1`,
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  };

  switch (destinationConfig.scope) {
    case RenderSyncScope.Service: {
      await makeRequestWithRetry(() =>
        request.request({
          ...req,
          url: `/services/${destinationConfig.serviceId}/env-vars`,
          data: envVars
        })
      );
      break;
    }

    case RenderSyncScope.EnvironmentGroup: {
      for await (const variable of envVars) {
        await makeRequestWithRetry(() =>
          request.request({
            ...req,
            url: `/env-groups/${destinationConfig.environmentGroupId}/env-vars/${variable.key}`,
            data: {
              value: variable.value
            }
          })
        );
      }
      break;
    }

    default:
      throw new BadRequestError({ message: "Unknown render sync destination scope" });
  }
};

const deleteEnvironmentSecret = async (
  secretSync: TRenderSyncWithCredentials,
  envVar: { key: string; value: string }
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  const req: AxiosRequestConfig = {
    baseURL: `${IntegrationUrls.RENDER_API_URL}/v1`,
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  };

  switch (destinationConfig.scope) {
    case RenderSyncScope.Service: {
      await makeRequestWithRetry(() =>
        request.request({
          ...req,
          url: `/services/${destinationConfig.serviceId}/env-vars/${envVar.key}`
        })
      );
      break;
    }

    case RenderSyncScope.EnvironmentGroup: {
      await makeRequestWithRetry(() =>
        request.request({
          ...req,
          url: `/env-groups/${destinationConfig.environmentGroupId}/env-vars/${envVar.key}`
        })
      );
      break;
    }

    default:
      throw new BadRequestError({ message: "Unknown render sync destination scope" });
  }
};

const redeployService = async (secretSync: TRenderSyncWithCredentials) => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  const req: AxiosRequestConfig = {
    baseURL: `${IntegrationUrls.RENDER_API_URL}/v1`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  };

  switch (destinationConfig.scope) {
    case RenderSyncScope.Service: {
      await makeRequestWithRetry(() =>
        request.request({
          ...req,
          method: "POST",
          url: `/services/${destinationConfig.serviceId}/deploys`,
          data: {}
        })
      );
      break;
    }

    case RenderSyncScope.EnvironmentGroup: {
      const { data } = await request.request<{ serviceLinks: { id: string }[] }>({
        ...req,
        method: "GET",
        url: `/env-groups/${destinationConfig.environmentGroupId}`
      });

      for await (const link of data.serviceLinks) {
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        await makeRequestWithRetry(() =>
          request.request({
            ...req,
            url: `/services/${link.id}/deploys`,
            data: {}
          })
        );
      }
      break;
    }

    default:
      throw new BadRequestError({ message: "Unknown render sync destination scope" });
  }
};

export const RenderSyncFns = {
  syncSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    const environmentSlug = secretSync.environment?.slug || "";
    const { disableSecretDeletion, keySchema } = secretSync.syncOptions;

    const finalEnvVars: Array<{ key: string; value: string }> = [];
    const secretsToDelete: Array<{ key: string; value: string }> = [];

    // Step 1: Process existing Render secrets - determine what to keep or delete
    for (const renderSecret of renderSecrets) {
      const existsInInfisical = Boolean(secretMap[renderSecret.key]);
      const isManagedByThisSync = matchesSchema(renderSecret.key, environmentSlug, keySchema);

      if (existsInInfisical) {
        // Secret exists in both Render and Infisical - will be updated in Step 2
        // eslint-disable-next-line no-continue
        continue;
      }

      // Secret exists in Render but NOT in Infisical
      if (isManagedByThisSync) {
        if (disableSecretDeletion) {
          finalEnvVars.push({ key: renderSecret.key, value: renderSecret.value });
        } else {
          secretsToDelete.push({ key: renderSecret.key, value: renderSecret.value });
        }
      } else {
        // Secret is NOT managed by this sync (doesn't match schema) - always preserve it
        finalEnvVars.push({ key: renderSecret.key, value: renderSecret.value });
      }
    }

    // Step 2: Process all secrets from Infisical (these will overwrite any duplicates from Step 1)
    for (const [key, secret] of Object.entries(secretMap)) {
      // Skip empty values as Render does not allow empty variables
      if (secret.value === "") {
        // eslint-disable-next-line no-continue
        continue;
      }

      finalEnvVars.push({ key, value: secret.value });
    }

    // Step 3: Batch update all secrets in Render
    await batchUpdateEnvironmentSecrets(secretSync, finalEnvVars);

    // Step 4: Delete secrets that were removed from Infisical, only for environment groups because it doesn't delete on the update call
    if (secretsToDelete.length > 0 && secretSync.destinationConfig.scope === RenderSyncScope.EnvironmentGroup) {
      await Promise.all(secretsToDelete.map((envVar) => deleteEnvironmentSecret(secretSync, envVar)));
    }

    if (secretSync.syncOptions.autoRedeployServices) {
      await redeployService(secretSync);
    }
  },

  getSecrets: async (secretSync: TRenderSyncWithCredentials): Promise<TSecretMap> => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    return Object.fromEntries(renderSecrets.map((secret) => [secret.key, { value: secret.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    const finalEnvVars: Array<{ key: string; value: string }> = [];

    for (const renderSecret of renderSecrets) {
      if (renderSecret.key in secretMap) {
        finalEnvVars.push({
          key: renderSecret.key,
          value: renderSecret.value
        });
      }
    }

    await Promise.all(finalEnvVars.map((el) => deleteEnvironmentSecret(secretSync, el)));

    if (secretSync.syncOptions.autoRedeployServices) {
      await redeployService(secretSync);
    }
  }
};
