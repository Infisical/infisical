/* eslint-disable no-await-in-loop */
import { safeRequest } from "@app/lib/validator";
import {
  getCloudflareAuthHeaders,
  paginateCloudflare
} from "@app/services/app-connection/cloudflare/cloudflare-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  CLOUDFLARE_SECRETS_STORE_SECRET_NAME_PATTERN,
  CLOUDFLARE_SECRETS_STORE_SECRET_NAME_RULE
} from "./cloudflare-secrets-store-sync-schemas";
import {
  TCloudflareSecretsStoreQuotaResponse,
  TCloudflareSecretsStoreSecret,
  TCloudflareSecretsStoreSyncWithCredentials
} from "./cloudflare-secrets-store-sync-types";

const getSecretsStoreUrl = (accountId: string) =>
  `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/secrets_store`;

const getStoreSecretsUrl = ({ connection, destinationConfig }: TCloudflareSecretsStoreSyncWithCredentials) =>
  `${getSecretsStoreUrl(connection.credentials.accountId)}/stores/${destinationConfig.storeId}/secrets`;

const listStoreSecrets = (secretSync: TCloudflareSecretsStoreSyncWithCredentials) =>
  paginateCloudflare<TCloudflareSecretsStoreSecret>(getStoreSecretsUrl(secretSync), {
    apiToken: secretSync.connection.credentials.apiToken
  });

const deleteStoreSecrets = async (
  secretSync: TCloudflareSecretsStoreSyncWithCredentials,
  secrets: TCloudflareSecretsStoreSecret[]
) => {
  const headers = getCloudflareAuthHeaders(secretSync.connection.credentials.apiToken);
  const secretsUrl = getStoreSecretsUrl(secretSync);

  for (const secret of secrets) {
    try {
      await safeRequest.delete(`${secretsUrl}/${secret.id}`, { headers });
    } catch (error) {
      throw new SecretSyncError({ error, secretKey: secret.name });
    }
  }
};

export const CloudflareSecretsStoreSyncFns = {
  async syncSecrets(secretSync: TCloudflareSecretsStoreSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const {
      connection: {
        credentials: { apiToken, accountId }
      },
      destinationConfig: { scopes },
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    // Rejected up front so a run either writes every key or writes none, rather than failing partway
    // through and leaving the store half updated.
    const invalidKeys = Object.keys(secretMap).filter((key) => !CLOUDFLARE_SECRETS_STORE_SECRET_NAME_PATTERN.test(key));
    if (invalidKeys.length) {
      throw new SecretSyncError({
        secretKey: invalidKeys[0],
        shouldRetry: false,
        message: `${invalidKeys.length} secret ${
          invalidKeys.length === 1 ? "key is" : "keys are"
        } not a valid Cloudflare Secrets Store secret name: ${invalidKeys.join(", ")}. ${CLOUDFLARE_SECRETS_STORE_SECRET_NAME_RULE}`
      });
    }

    const headers = getCloudflareAuthHeaders(apiToken);
    const secretsUrl = getStoreSecretsUrl(secretSync);

    const existingSecrets = await listStoreSecrets(secretSync);
    const existingByName = new Map(existingSecrets.map((secret) => [secret.name, secret]));

    const secretsToDelete = disableSecretDeletion
      ? []
      : existingSecrets.filter(
          (secret) =>
            !Object.hasOwn(secretMap, secret.name) && matchesSchema(secret.name, environment?.slug || "", keySchema)
        );
    const newSecretCount = Object.keys(secretMap).filter((key) => !existingByName.has(key)).length;

    // The quota is account-wide, so a sync that would exceed it is refused before any write rather than
    // failing on the first create past the limit with the store half updated.
    if (newSecretCount) {
      const { data } = await safeRequest.get<TCloudflareSecretsStoreQuotaResponse>(
        `${getSecretsStoreUrl(accountId)}/quota`,
        { headers }
      );
      const { quota, usage } = data.result.secrets;

      if (usage + newSecretCount > quota) {
        throw new SecretSyncError({
          shouldRetry: false,
          message: `This sync would create ${newSecretCount} secrets, which exceeds the Cloudflare account's limit of ${quota} Secrets Store secrets (${usage} in use). Secrets this sync removes are deleted only after the new ones are created, so they still count toward the limit. Delete unused secrets from the store or sync fewer secrets.`
        });
      }
    }

    for (const [key, { value }] of Object.entries(secretMap)) {
      const existing = existingByName.get(key);

      try {
        if (existing) {
          // Cloudflare never returns a secret's value, so there is no way to skip an unchanged write.
          await safeRequest.patch(`${secretsUrl}/${existing.id}`, { value, scopes }, { headers });
        } else {
          await safeRequest.post(secretsUrl, [{ name: key, value, scopes }], { headers });
        }
      } catch (error) {
        throw new SecretSyncError({ error, secretKey: key });
      }
    }

    // Deleted only after every write succeeds, so a failed run never leaves the store without a secret
    // it had, such as the old name of a renamed key.
    await deleteStoreSecrets(secretSync, secretsToDelete);
  },

  getSecrets: async (): Promise<TSecretMap> => {
    // Cloudflare never returns a secret's value, so there is nothing to import. Reflected as
    // canImportSecrets: false on the schema and list item.
    throw new Error("Cloudflare Secrets Store does not support importing secrets.");
  },

  async removeSecrets(secretSync: TCloudflareSecretsStoreSyncWithCredentials, payload: TSecretSyncPayload) {
    const secretMap = payload.flatten();
    const existingSecrets = await listStoreSecrets(secretSync);

    await deleteStoreSecrets(
      secretSync,
      existingSecrets.filter((secret) => Object.hasOwn(secretMap, secret.name))
    );
  }
};
