/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { TDevinListSecretsResponse, TDevinSecret, TDevinSyncWithCredentials } from "./devin-sync-types";

const DEVIN_LIST_PAGE_SIZE = 200;

const buildAuthHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json"
});

const buildSecretsUrl = (orgId: string) =>
  `${IntegrationUrls.DEVIN_API_URL}/v3/organizations/${encodeURIComponent(orgId)}/secrets`;

const listAllDevinSecrets = async ({ apiKey, orgId }: { apiKey: string; orgId: string }) => {
  const secrets: TDevinSecret[] = [];
  let cursor: string | null = null;

  do {
    const params: Record<string, string | number> = { first: DEVIN_LIST_PAGE_SIZE };
    if (cursor) params.after = cursor;

    const { data } = await request.get<TDevinListSecretsResponse>(buildSecretsUrl(orgId), {
      params,
      headers: buildAuthHeaders(apiKey)
    });

    secrets.push(...data.items);
    cursor = data.has_next_page ? data.end_cursor : null;
  } while (cursor);

  return secrets;
};

const deleteDevinSecret = async ({ apiKey, orgId, secretId }: { apiKey: string; orgId: string; secretId: string }) => {
  await request.delete(`${buildSecretsUrl(orgId)}/${encodeURIComponent(secretId)}`, {
    headers: buildAuthHeaders(apiKey)
  });
};

const createDevinSecret = async ({
  apiKey,
  orgId,
  key,
  value,
  note
}: {
  apiKey: string;
  orgId: string;
  key: string;
  value: string;
  note?: string;
}) => {
  await request.post(
    buildSecretsUrl(orgId),
    {
      type: "key-value",
      key,
      value,
      is_sensitive: true,
      note
    },
    { headers: buildAuthHeaders(apiKey) }
  );
};

const upsertDevinSecret = async ({
  apiKey,
  orgId,
  key,
  value,
  note,
  existingSecretsByKey
}: {
  apiKey: string;
  orgId: string;
  key: string;
  value: string;
  note?: string;
  existingSecretsByKey: Map<string, TDevinSecret>;
}) => {
  try {
    await createDevinSecret({ apiKey, orgId, key, value, note });
  } catch (error) {
    const status = error instanceof AxiosError ? error.response?.status : undefined;
    const existing = existingSecretsByKey.get(key);

    if (!existing || (status !== 409 && status !== 422)) {
      throw new SecretSyncError({ error, secretKey: key });
    }

    try {
      await deleteDevinSecret({ apiKey, orgId, secretId: existing.secret_id });
      await createDevinSecret({ apiKey, orgId, key, value, note });
    } catch (retryError) {
      throw new SecretSyncError({ error: retryError, secretKey: key });
    }
  }
};

const buildSyncNote = (secretSync: TDevinSyncWithCredentials) => {
  const envSlug = secretSync.environment?.slug;
  return envSlug ? `Synced from Infisical (${envSlug})` : "Synced from Infisical";
};

export const DevinSyncFns = {
  syncSecrets: async (secretSync: TDevinSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiKey }
      },
      destinationConfig: { orgId },
      environment,
      syncOptions
    } = secretSync;

    const note = buildSyncNote(secretSync);

    const existingSecrets = await listAllDevinSecrets({ apiKey, orgId });
    const existingSecretsByKey = new Map<string, TDevinSecret>();
    for (const secret of existingSecrets) {
      if (secret.key) existingSecretsByKey.set(secret.key, secret);
    }

    for (const [key, { value }] of Object.entries(secretMap)) {
      await upsertDevinSecret({ apiKey, orgId, key, value, note, existingSecretsByKey });
    }

    if (syncOptions.disableSecretDeletion) return;

    for (const secret of existingSecrets) {
      const isStaleManagedSecret =
        secret.key &&
        matchesSchema(secret.key, environment?.slug || "", syncOptions.keySchema) &&
        !(secret.key in secretMap);

      if (isStaleManagedSecret) {
        try {
          await deleteDevinSecret({ apiKey, orgId, secretId: secret.secret_id });
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: secret.key ?? undefined });
        }
      }
    }
  },
  removeSecrets: async (secretSync: TDevinSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection: {
        credentials: { apiKey }
      },
      destinationConfig: { orgId }
    } = secretSync;

    const existingSecrets = await listAllDevinSecrets({ apiKey, orgId });

    for (const secret of existingSecrets) {
      if (secret.key && secret.key in secretMap) {
        try {
          await deleteDevinSecret({ apiKey, orgId, secretId: secret.secret_id });
        } catch (error) {
          throw new SecretSyncError({ error, secretKey: secret.key });
        }
      }
    }
  },
  getSecrets: async (secretSync: TDevinSyncWithCredentials): Promise<TSecretMap> => {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  }
};
