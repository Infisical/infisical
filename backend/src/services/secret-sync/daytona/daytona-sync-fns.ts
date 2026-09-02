/* eslint-disable no-await-in-loop */
import { HttpStatusCode, isAxiosError } from "axios";

import { safeRequest } from "@app/lib/validator/safe-request";
import { getDaytonaAuthHeaders } from "@app/services/app-connection/daytona";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { DAYTONA_SECRET_NAME_PATTERN, DAYTONA_SECRET_NAME_RULE } from "./daytona-sync-schemas";
import { TDaytonaListSecretsResponse, TDaytonaSecret, TDaytonaSyncWithCredentials } from "./daytona-sync-types";

const DAYTONA_PAGE_SIZE = 200;
const DAYTONA_MAX_PAGES = 10;

const listDaytonaSecrets = async (apiKey: string): Promise<TDaytonaSecret[]> => {
  const secrets: TDaytonaSecret[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < DAYTONA_MAX_PAGES; page += 1) {
    const currentCursor = cursor;

    const { data } = await safeRequest.get<TDaytonaListSecretsResponse>(
      `${IntegrationUrls.DAYTONA_API_URL}/secret/paginated`,
      {
        params: { limit: DAYTONA_PAGE_SIZE, ...(currentCursor ? { cursor: currentCursor } : {}) },
        headers: getDaytonaAuthHeaders(apiKey)
      }
    );

    secrets.push(...(data.items ?? []));

    cursor = data.nextCursor ?? undefined;
    if (!cursor) return secrets;
  }

  // Returning here would hand reconciliation a partial snapshot: keys past the cap would look
  // absent, so the sync would recreate them and skip deletions it owed.
  throw new Error(
    `Daytona returned more than ${DAYTONA_MAX_PAGES * DAYTONA_PAGE_SIZE} secrets, which exceeds the ${DAYTONA_MAX_PAGES} page listing cap. Refusing to sync from an incomplete view of the destination.`
  );
};

const createDaytonaSecret = (apiKey: string, name: string, value: string) =>
  safeRequest.post(
    `${IntegrationUrls.DAYTONA_API_URL}/secret`,
    { name, value },
    { headers: getDaytonaAuthHeaders(apiKey) }
  );

const updateDaytonaSecretValue = (apiKey: string, secretId: string, value: string) =>
  safeRequest.patch(
    `${IntegrationUrls.DAYTONA_API_URL}/secret/${encodeURIComponent(secretId)}`,
    { value },
    { headers: getDaytonaAuthHeaders(apiKey) }
  );

const deleteDaytonaSecret = (apiKey: string, secretId: string) =>
  safeRequest.delete(`${IntegrationUrls.DAYTONA_API_URL}/secret/${encodeURIComponent(secretId)}`, {
    headers: getDaytonaAuthHeaders(apiKey)
  });

export const DaytonaSyncFns = {
  async syncSecrets(secretSync: TDaytonaSyncWithCredentials, secretMap: TSecretMap) {
    const {
      connection,
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { apiKey } = connection.credentials;

    // Rejected up front so a run either writes every key or writes none, rather than failing partway
    // through and leaving the destination half updated.
    const invalidKeys = Object.keys(secretMap).filter((key) => !DAYTONA_SECRET_NAME_PATTERN.test(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid Daytona secret name: ${invalidKeys.join(", ")}. ${DAYTONA_SECRET_NAME_RULE}`
      });
    }

    const existingSecrets = await listDaytonaSecrets(apiKey);
    const existingByName = new Map(existingSecrets.map((secret) => [secret.name, secret]));

    for (const [key, { value }] of Object.entries(secretMap)) {
      const existing = existingByName.get(key);

      try {
        if (existing) {
          // Daytona never returns a secret's value, so there is no way to skip an unchanged write.
          await updateDaytonaSecretValue(apiKey, existing.id, value);
        } else {
          await createDaytonaSecret(apiKey, key, value);
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === HttpStatusCode.Conflict) {
          throw new SecretSyncError({
            error,
            secretKey: key,
            message: `A Daytona secret named "${key}" already exists but was not present when this sync started. Re-run the sync.`
          });
        }

        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    if (disableSecretDeletion) return;

    for (const secret of existingSecrets) {
      // Own-property check, not `in`: `in` walks the prototype chain, so a Daytona secret named
      // constructor or toString would match a folder that contains no such key.
      if (Object.hasOwn(secretMap, secret.name)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!matchesSchema(secret.name, environment?.slug || "", keySchema)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        await deleteDaytonaSecret(apiKey, secret.id);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: secret.name });
      }
    }
  },

  getSecrets: async (): Promise<TSecretMap> => {
    // Daytona returns only a secret's metadata and an opaque placeholder, never its value, so there is
    // nothing to import. Reflected as canImportSecrets: false on the schema and list item.
    throw new Error("Daytona does not support importing secrets.");
  },

  async removeSecrets(secretSync: TDaytonaSyncWithCredentials, secretMap: TSecretMap) {
    const { apiKey } = secretSync.connection.credentials;

    const existingSecrets = await listDaytonaSecrets(apiKey);

    for (const secret of existingSecrets) {
      if (!Object.hasOwn(secretMap, secret.name)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        await deleteDaytonaSecret(apiKey, secret.id);
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: secret.name });
      }
    }
  }
};
