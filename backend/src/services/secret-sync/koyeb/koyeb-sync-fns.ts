/* eslint-disable no-await-in-loop */
import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TKoyebSyncWithCredentials } from "./koyeb-sync-types";

type TKoyebSecret = {
  id: string;
  name: string;
  type: string;
  value: string;
};

type TKoyebListSecretsResponse = {
  secrets: TKoyebSecret[];
  limit: number;
  offset: number;
  count: number;
};

type TKoyebSecretResponse = {
  secret: TKoyebSecret;
};

const getHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json"
});

const listKoyebSecrets = async (apiKey: string): Promise<TKoyebSecret[]> => {
  const allSecrets: TKoyebSecret[] = [];
  const perPage = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data } = await request.get<TKoyebListSecretsResponse>(
      `${IntegrationUrls.KOYEB_API_URL}/secrets?limit=${perPage}&offset=${offset}`,
      { headers: getHeaders(apiKey) }
    );

    allSecrets.push(...data.secrets);

    if (data.secrets.length < perPage) {
      hasMore = false;
    } else {
      offset += perPage;
    }
  }

  return allSecrets;
};

const createKoyebSecret = async (apiKey: string, name: string, value: string): Promise<TKoyebSecret> => {
  const { data } = await request.post<TKoyebSecretResponse>(
    `${IntegrationUrls.KOYEB_API_URL}/secrets`,
    { name, type: "SIMPLE", value },
    { headers: getHeaders(apiKey) }
  );
  return data.secret;
};

const updateKoyebSecret = async (apiKey: string, secretId: string, name: string, value: string): Promise<void> => {
  await request.put(
    `${IntegrationUrls.KOYEB_API_URL}/secrets/${secretId}`,
    { name, type: "SIMPLE", value },
    { headers: getHeaders(apiKey) }
  );
};

const deleteKoyebSecret = async (apiKey: string, secretId: string): Promise<void> => {
  await request.delete(`${IntegrationUrls.KOYEB_API_URL}/secrets/${secretId}`, {
    headers: getHeaders(apiKey)
  });
};

export const KoyebSyncFns = {
  syncSecrets: async (secretSync: TKoyebSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiKey }
      }
    } = secretSync;

    const existingSecrets = await listKoyebSecrets(apiKey);
    const environmentSlug = secretSync.environment?.slug || "";
    const { disableSecretDeletion, keySchema } = secretSync.syncOptions;

    // Build a map of existing Koyeb secrets by name for quick lookup
    const existingByName = new Map(existingSecrets.map((s) => [s.name, s]));

    // Step 1: Create or update secrets from Infisical
    for (const [key, secret] of Object.entries(secretMap)) {
      const existing = existingByName.get(key);

      if (existing) {
        // Update existing secret
        await updateKoyebSecret(apiKey, existing.id, key, secret.value);
      } else {
        // Create new secret
        await createKoyebSecret(apiKey, key, secret.value);
      }
    }

    // Step 2: Delete secrets that exist in Koyeb but not in Infisical (if managed by this sync)
    if (!disableSecretDeletion) {
      for (const koyebSecret of existingSecrets) {
        const existsInInfisical = Boolean(secretMap[koyebSecret.name]);
        const isManagedByThisSync = matchesSchema(koyebSecret.name, environmentSlug, keySchema);

        if (!existsInInfisical && isManagedByThisSync) {
          await deleteKoyebSecret(apiKey, koyebSecret.id);
        }
      }
    }
  },

  // Koyeb API masks secret values with "*****", so we cannot import them
  getSecrets: async (_secretSync: TKoyebSyncWithCredentials): Promise<TSecretMap> => {
    return {};
  },

  removeSecrets: async (secretSync: TKoyebSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiKey }
      }
    } = secretSync;

    const existingSecrets = await listKoyebSecrets(apiKey);
    const existingByName = new Map(existingSecrets.map((s) => [s.name, s]));

    for (const key of Object.keys(secretMap)) {
      const existing = existingByName.get(key);
      if (existing) {
        await deleteKoyebSecret(apiKey, existing.id);
      }
    }
  }
};
