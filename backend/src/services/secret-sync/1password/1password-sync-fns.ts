import { request } from "@app/lib/config/request";
import { getOnePassInstanceUrl } from "@app/services/app-connection/1password";
import {
  TDeleteOnePassVariable,
  TOnePassListVariables,
  TOnePassListVariablesResponse,
  TOnePassSyncWithCredentials,
  TOnePassVariable,
  TOnePassVariableDetails,
  TPostOnePassVariable,
  TPutOnePassVariable
} from "@app/services/secret-sync/1password/1password-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

const listOnePassItems = async ({ instanceUrl, apiToken, vaultId }: TOnePassListVariables) => {
  const { data } = await request.get<TOnePassListVariablesResponse>(`${instanceUrl}/v1/vaults/${vaultId}/items`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });

  const result: Record<string, TOnePassVariable & { value: string; fieldId: string }> = {};

  for await (const s of data) {
    const { data: secret } = await request.get<TOnePassVariableDetails>(
      `${instanceUrl}/v1/vaults/${vaultId}/items/${s.id}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json"
        }
      }
    );

    const value = secret.fields.find((f) => f.label === "value")?.value;
    const fieldId = secret.fields.find((f) => f.label === "value")?.id;

    // eslint-disable-next-line no-continue
    if (!value || !fieldId) continue;

    result[s.title] = {
      ...secret,
      value,
      fieldId
    };
  }

  return result;
};

const createOnePassItem = async ({ instanceUrl, apiToken, vaultId, itemTitle, itemValue }: TPostOnePassVariable) => {
  return request.post(
    `${instanceUrl}/v1/vaults/${vaultId}/items`,
    {
      title: itemTitle,
      category: "API_CREDENTIAL",
      vault: {
        id: vaultId
      },
      tags: ["synced-from-infisical"],
      fields: [
        {
          label: "value",
          value: itemValue,
          type: "CONCEALED"
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

const updateOnePassItem = async ({
  instanceUrl,
  apiToken,
  vaultId,
  itemId,
  fieldId,
  itemTitle,
  itemValue
}: TPutOnePassVariable) => {
  return request.put(
    `${instanceUrl}/v1/vaults/${vaultId}/items/${itemId}`,
    {
      id: itemId,
      title: itemTitle,
      category: "API_CREDENTIAL",
      vault: {
        id: vaultId
      },
      tags: ["synced-from-infisical"],
      fields: [
        {
          id: fieldId,
          label: "value",
          value: itemValue,
          type: "CONCEALED"
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    }
  );
};

const deleteOnePassItem = async ({ instanceUrl, apiToken, vaultId, itemId }: TDeleteOnePassVariable) => {
  return request.delete(`${instanceUrl}/v1/vaults/${vaultId}/items/${itemId}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`
    }
  });
};

export const OnePassSyncFns = {
  syncSecrets: async (secretSync: TOnePassSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      environment,
      destinationConfig: { vaultId }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    const items = await listOnePassItems({ instanceUrl, apiToken, vaultId });

    for await (const entry of Object.entries(secretMap)) {
      const [key, { value }] = entry;

      try {
        if (key in items) {
          await updateOnePassItem({
            instanceUrl,
            apiToken,
            vaultId,
            itemTitle: key,
            itemValue: value,
            itemId: items[key].id,
            fieldId: items[key].fieldId
          });
        } else {
          await createOnePassItem({ instanceUrl, apiToken, vaultId, itemTitle: key, itemValue: value });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    for await (const [key, variable] of Object.entries(items)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      if (!(key in secretMap)) {
        try {
          await deleteOnePassItem({
            instanceUrl,
            apiToken,
            vaultId,
            itemId: variable.id
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },
  removeSecrets: async (secretSync: TOnePassSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { vaultId }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    const items = await listOnePassItems({ instanceUrl, apiToken, vaultId });

    for await (const [key, item] of Object.entries(items)) {
      if (key in secretMap) {
        try {
          await deleteOnePassItem({
            apiToken,
            vaultId,
            instanceUrl,
            itemId: item.id
          });
        } catch (error) {
          throw new SecretSyncError({
            error,
            secretKey: key
          });
        }
      }
    }
  },
  getSecrets: async (secretSync: TOnePassSyncWithCredentials) => {
    const {
      connection,
      destinationConfig: { vaultId }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    return listOnePassItems({ instanceUrl, apiToken, vaultId });
  }
};
