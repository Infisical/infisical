import { request } from "@app/lib/config/request";
import { getOnePassInstanceUrl } from "@app/services/app-connection/1password";
import {
  TDeleteOnePassVariable,
  TOnePassListVariables,
  TOnePassListVariablesResponse,
  TOnePassSyncWithCredentials,
  TOnePassVariable,
  TPostOnePassVariable,
  TPutOnePassVariable
} from "@app/services/secret-sync/1password/1password-sync-types";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

// This should not be changed or it may break existing logic
const VALUE_LABEL_DEFAULT = "value";

const listOnePassItems = async ({ instanceUrl, apiToken, vaultId, valueLabel }: TOnePassListVariables) => {
  const { data } = await request.get<TOnePassListVariablesResponse>(`${instanceUrl}/v1/vaults/${vaultId}/items`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });

  const items: Record<string, TOnePassVariable & { value: string; fieldId: string }> = {};
  const duplicates: Record<string, string> = {};

  for await (const s of data) {
    // eslint-disable-next-line no-continue
    if (s.category !== "API_CREDENTIAL") continue;

    if (items[s.title]) {
      duplicates[s.id] = s.title;
      // eslint-disable-next-line no-continue
      continue;
    }

    const { data: secret } = await request.get<TOnePassVariable>(`${instanceUrl}/v1/vaults/${vaultId}/items/${s.id}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });

    const valueField = secret.fields.find((f) => f.label === valueLabel);

    // eslint-disable-next-line no-continue
    if (!valueField || !valueField.value || !valueField.id) continue;

    items[s.title] = {
      ...secret,
      value: valueField.value,
      fieldId: valueField.id
    };
  }

  return { items, duplicates };
};

const createOnePassItem = async ({
  instanceUrl,
  apiToken,
  vaultId,
  itemTitle,
  itemValue,
  valueLabel
}: TPostOnePassVariable) => {
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
          label: valueLabel,
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
  itemValue,
  valueLabel,
  otherFields
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
        ...otherFields,
        {
          id: fieldId,
          label: valueLabel,
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
      destinationConfig: { vaultId, valueLabel }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    const { items, duplicates } = await listOnePassItems({
      instanceUrl,
      apiToken,
      vaultId,
      valueLabel: valueLabel || VALUE_LABEL_DEFAULT
    });

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
            fieldId: items[key].fieldId,
            valueLabel: valueLabel || VALUE_LABEL_DEFAULT,
            otherFields: items[key].fields.filter((field) => field.label !== (valueLabel || VALUE_LABEL_DEFAULT))
          });
        } else {
          await createOnePassItem({
            instanceUrl,
            apiToken,
            vaultId,
            itemTitle: key,
            itemValue: value,
            valueLabel: valueLabel || VALUE_LABEL_DEFAULT
          });
        }
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    if (secretSync.syncOptions.disableSecretDeletion) return;

    // Delete duplicate item entries
    for await (const [itemId, key] of Object.entries(duplicates)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      try {
        await deleteOnePassItem({
          instanceUrl,
          apiToken,
          vaultId,
          itemId
        });
      } catch (error) {
        throw new SecretSyncError({
          error,
          secretKey: key
        });
      }
    }

    // Delete item entries that are not in secretMap
    for await (const [key, item] of Object.entries(items)) {
      // eslint-disable-next-line no-continue
      if (!matchesSchema(key, environment?.slug || "", secretSync.syncOptions.keySchema)) continue;

      if (!(key in secretMap)) {
        try {
          await deleteOnePassItem({
            instanceUrl,
            apiToken,
            vaultId,
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
  removeSecrets: async (secretSync: TOnePassSyncWithCredentials, secretMap: TSecretMap) => {
    const {
      connection,
      destinationConfig: { vaultId, valueLabel }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    const { items } = await listOnePassItems({
      instanceUrl,
      apiToken,
      vaultId,
      valueLabel: valueLabel || VALUE_LABEL_DEFAULT
    });

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
      destinationConfig: { vaultId, valueLabel }
    } = secretSync;

    const instanceUrl = await getOnePassInstanceUrl(connection);
    const { apiToken } = connection.credentials;

    const res = await listOnePassItems({
      instanceUrl,
      apiToken,
      vaultId,
      valueLabel: valueLabel || VALUE_LABEL_DEFAULT
    });

    return Object.fromEntries(Object.entries(res.items).map(([key, item]) => [key, { value: item.value }]));
  }
};
