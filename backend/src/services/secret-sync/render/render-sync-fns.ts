/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

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

const getRenderEnvironmentSecrets = async (secretSync: TRenderSyncWithCredentials): Promise<TRenderSecret[]> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  const baseUrl = `${IntegrationUrls.RENDER_API_URL}/v1/services/${destinationConfig.serviceId}/env-vars`;
  const allSecrets: TRenderSecret[] = [];
  let cursor: string | undefined;

  do {
    const url = cursor ? `${baseUrl}?cursor=${cursor}` : baseUrl;

    const { data } = await makeRequestWithRetry(() =>
      request.get<
        {
          envVar: {
            key: string;
            value: string;
          };
          cursor: string;
        }[]
      >(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
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

  await makeRequestWithRetry(() =>
    request.put(`${IntegrationUrls.RENDER_API_URL}/v1/services/${destinationConfig.serviceId}/env-vars`, envVars, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    })
  );
};

export const RenderSyncFns = {
  syncSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);

    const finalEnvVars: Array<{ key: string; value: string }> = [];

    for (const renderSecret of renderSecrets) {
      const shouldKeep =
        secretMap[renderSecret.key] ||
        (secretSync.syncOptions.disableSecretDeletion &&
          !matchesSchema(renderSecret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema));

      if (shouldKeep && !secretMap[renderSecret.key]) {
        finalEnvVars.push({
          key: renderSecret.key,
          value: renderSecret.value
        });
      }
    }

    for (const [key, secret] of Object.entries(secretMap)) {
      // Skip empty values as render does not allow empty variables
      if (secret.value === "") {
        // eslint-disable-next-line no-continue
        continue;
      }

      finalEnvVars.push({
        key,
        value: secret.value
      });
    }

    await batchUpdateEnvironmentSecrets(secretSync, finalEnvVars);
  },

  getSecrets: async (secretSync: TRenderSyncWithCredentials): Promise<TSecretMap> => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    return Object.fromEntries(renderSecrets.map((secret) => [secret.key, { value: secret.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    const finalEnvVars: Array<{ key: string; value: string }> = [];

    for (const renderSecret of renderSecrets) {
      if (!(renderSecret.key in secretMap)) {
        finalEnvVars.push({
          key: renderSecret.key,
          value: renderSecret.value
        });
      }
    }
    await batchUpdateEnvironmentSecrets(secretSync, finalEnvVars);
  }
};
