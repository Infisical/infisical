/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TRenderSecret, TRenderSyncWithCredentials } from "./render-sync-types";

const MAX_RETRIES = 5;

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 2000);
  });

const retrySleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 60000);
  });

const getRenderEnvironmentSecrets = async (
  secretSync: TRenderSyncWithCredentials,
  attempt = 0
): Promise<TRenderSecret[]> => {
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

    try {
      const { data } = await request.get<
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
      });

      const secrets = data.map((item) => ({
        key: item.envVar.key,
        value: item.envVar.value
      }));

      allSecrets.push(...secrets);
      cursor = data[data.length - 1]?.cursor;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
        await retrySleep();
        return await getRenderEnvironmentSecrets(secretSync, attempt + 1);
      }
      throw error;
    }
  } while (cursor);

  return allSecrets;
};

const putEnvironmentSecret = async (
  secretSync: TRenderSyncWithCredentials,
  secretMap: TSecretMap,
  key: string,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  try {
    await request.put(
      `${IntegrationUrls.RENDER_API_URL}/v1/services/${destinationConfig.serviceId}/env-vars/${key}`,
      {
        key,
        value: secretMap[key].value
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
      await retrySleep();
      return await putEnvironmentSecret(secretSync, secretMap, key, attempt + 1);
    }
    throw error;
  }
};

const deleteEnvironmentSecret = async (
  secretSync: TRenderSyncWithCredentials,
  secret: Pick<TRenderSecret, "key">,
  attempt = 0
): Promise<void> => {
  const {
    destinationConfig,
    connection: {
      credentials: { apiKey }
    }
  } = secretSync;

  try {
    await request.delete(
      `${IntegrationUrls.RENDER_API_URL}/v1/services/${destinationConfig.serviceId}/env-vars/${secret.key}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      // If the secret does not exist, we can ignore this error
      return;
    }

    if (isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
      await retrySleep();
      return await deleteEnvironmentSecret(secretSync, secret, attempt + 1);
    }

    throw error;
  }
};

export const RenderSyncFns = {
  syncSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);

    for await (const key of Object.keys(secretMap)) {
      // If value is empty skip it as render does not allow empty variables
      if (secretMap[key].value === "") {
        // eslint-disable-next-line no-continue
        continue;
      }
      await putEnvironmentSecret(secretSync, secretMap, key);
      await sleep();
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const renderSecret of renderSecrets) {
      if (!matchesSchema(renderSecret.key, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema))
        // eslint-disable-next-line no-continue
        continue;

      if (!secretMap[renderSecret.key]) {
        await deleteEnvironmentSecret(secretSync, renderSecret);
        await sleep();
      }
    }
  },

  getSecrets: async (secretSync: TRenderSyncWithCredentials): Promise<TSecretMap> => {
    const renderSecrets = await getRenderEnvironmentSecrets(secretSync);
    return Object.fromEntries(renderSecrets.map((secret) => [secret.key, { value: secret.value ?? "" }]));
  },

  removeSecrets: async (secretSync: TRenderSyncWithCredentials, secretMap: TSecretMap) => {
    const encryptedSecrets = await getRenderEnvironmentSecrets(secretSync);

    for await (const encryptedSecret of encryptedSecrets) {
      if (encryptedSecret.key in secretMap) {
        await deleteEnvironmentSecret(secretSync, encryptedSecret);
        await sleep();
      }
    }
  }
};
