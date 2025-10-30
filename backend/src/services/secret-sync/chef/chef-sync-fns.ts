import { getChefDataBagItem, updateChefDataBagItem } from "@app/services/app-connection/chef";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  ChefSecret,
  TChefDataBagItemContent,
  TChefSecret,
  TChefSecrets,
  TChefSyncWithCredentials,
  TGetChefSecrets
} from "./chef-sync-types";

const getChefSecretsRaw = async ({
  serverUrl,
  userName,
  privateKey,
  orgName,
  dataBagName,
  dataBagItemName
}: TGetChefSecrets): Promise<TChefDataBagItemContent> => {
  const dataBagItem = await getChefDataBagItem({
    serverUrl,
    userName,
    privateKey,
    orgName,
    dataBagName,
    dataBagItemName
  });

  // Ensure the data bag item has an id field
  if (!dataBagItem.id) {
    dataBagItem.id = dataBagItemName;
  }

  return dataBagItem;
};

const getChefSecrets = async (secretSync: TChefSyncWithCredentials): Promise<TChefSecrets> => {
  const {
    connection,
    destinationConfig: { dataBagName, dataBagItemName }
  } = secretSync;

  const { serverUrl, userName, privateKey, orgName } = connection.credentials;

  const dataBagItem = await getChefSecretsRaw({
    serverUrl,
    orgName,
    userName,
    privateKey,
    dataBagName,
    dataBagItemName
  });

  const { id, ...existingSecrets } = dataBagItem;

  // Convert data bag item to key-value pairs
  const secrets: ChefSecret[] = [];
  Object.entries(existingSecrets).forEach(([key, value]) => {
    if (key !== "id" && value !== null && value !== undefined) {
      secrets.push({ key, value: String(value) });
    }
  });

  return { id, secrets };
};

const updateChefSecrets = async (
  secretSync: TChefSyncWithCredentials,
  id: string,
  secrets: Record<string, TChefSecret>
) => {
  const {
    connection,
    destinationConfig: { dataBagName, dataBagItemName }
  } = secretSync;

  const { serverUrl, userName, privateKey, orgName } = connection.credentials;

  // Chef data bag items must have an 'id' field
  const dataBagItemContent: TChefDataBagItemContent = {
    id,
    ...secrets
  };

  await updateChefDataBagItem({
    serverUrl,
    orgName,
    userName,
    privateKey,
    dataBagName,
    dataBagItemName,
    data: dataBagItemContent
  });
};

export const ChefSyncFns = {
  async syncSecrets(secretSync: TChefSyncWithCredentials, secretMap: TSecretMap) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const { id, secrets } = await getChefSecrets(secretSync);

    // Create a map of the existing secrets
    const updatedSecretsMap = new Map(secrets.map((secret) => [secret.key, secret.value]));

    // Add/update new secrets
    for (const [key, { value }] of Object.entries(secretMap)) {
      updatedSecretsMap.set(key, value);
    }

    // Delete secrets if not disabled
    if (!disableSecretDeletion) {
      secrets.forEach((secret) => {
        if (!matchesSchema(secret.key, environment?.slug || "", keySchema)) return;

        if (!secretMap[secret.key]) {
          updatedSecretsMap.delete(secret.key);
        }
      });
    }

    // Convert map to object for Chef API
    const updatedSecrets = Object.fromEntries(updatedSecretsMap.entries());

    await updateChefSecrets(secretSync, id, updatedSecrets);
  },

  async getSecrets(secretSync: TChefSyncWithCredentials): Promise<TSecretMap> {
    const { secrets } = await getChefSecrets(secretSync);

    return Object.fromEntries(secrets.map((secret) => [secret.key, { value: secret.value }]));
  },

  async removeSecrets(secretSync: TChefSyncWithCredentials, secretMap: TSecretMap) {
    const { id, secrets: existingSecrets } = await getChefSecrets(secretSync);

    const newSecrets = existingSecrets.filter((secret) => !Object.hasOwn(secretMap, secret.key));

    if (newSecrets.length === existingSecrets.length) {
      return;
    }

    const updatedSecrets = Object.fromEntries(newSecrets.map((secret) => [secret.key, secret.value]));

    await updateChefSecrets(secretSync, id, updatedSecrets);
  }
};
