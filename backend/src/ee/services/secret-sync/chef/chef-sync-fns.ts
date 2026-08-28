import { getChefDataBagItem, updateChefDataBagItem } from "@app/ee/services/app-connections/chef";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
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

type TChefSyncGatewayV2Service = Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
type TChefSyncGatewayPoolService = Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;

const resolveGatewayId = async (
  secretSync: TChefSyncWithCredentials,
  gatewayPoolService: TChefSyncGatewayPoolService
) => {
  return gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: secretSync.connection.gatewayId,
    gatewayPoolId: secretSync.connection.gatewayPoolId
  });
};

const getChefSecretsRaw = async (
  { serverUrl, userName, privateKey, orgName, dataBagName, dataBagItemName, gatewayId }: TGetChefSecrets,
  gatewayV2Service: TChefSyncGatewayV2Service
): Promise<TChefDataBagItemContent> => {
  const dataBagItem = await getChefDataBagItem(
    {
      serverUrl,
      userName,
      privateKey,
      orgName,
      dataBagName,
      dataBagItemName,
      gatewayId
    },
    gatewayV2Service
  );

  // Ensure the data bag item has an id field
  if (!dataBagItem.id) {
    dataBagItem.id = dataBagItemName;
  }

  return dataBagItem;
};

const getChefSecrets = async (
  secretSync: TChefSyncWithCredentials,
  gatewayId: string | null,
  gatewayV2Service: TChefSyncGatewayV2Service
): Promise<TChefSecrets> => {
  const {
    connection,
    destinationConfig: { dataBagName, dataBagItemName }
  } = secretSync;

  const { serverUrl, userName, privateKey, orgName } = connection.credentials;

  const dataBagItem = await getChefSecretsRaw(
    {
      serverUrl,
      orgName,
      userName,
      privateKey,
      dataBagName,
      dataBagItemName,
      gatewayId
    },
    gatewayV2Service
  );

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
  secrets: Record<string, TChefSecret>,
  gatewayId: string | null,
  gatewayV2Service: TChefSyncGatewayV2Service
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

  await updateChefDataBagItem(
    {
      serverUrl,
      orgName,
      userName,
      privateKey,
      dataBagName,
      dataBagItemName,
      data: dataBagItemContent,
      gatewayId
    },
    gatewayV2Service
  );
};

export const ChefSyncFns = {
  async syncSecrets(
    secretSync: TChefSyncWithCredentials,
    secretMap: TSecretMap,
    gatewayV2Service: TChefSyncGatewayV2Service,
    gatewayPoolService: TChefSyncGatewayPoolService
  ) {
    const {
      environment,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const gatewayId = await resolveGatewayId(secretSync, gatewayPoolService);

    const { id, secrets } = await getChefSecrets(secretSync, gatewayId, gatewayV2Service);

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

    await updateChefSecrets(secretSync, id, updatedSecrets, gatewayId, gatewayV2Service);
  },

  async getSecrets(
    secretSync: TChefSyncWithCredentials,
    gatewayV2Service: TChefSyncGatewayV2Service,
    gatewayPoolService: TChefSyncGatewayPoolService
  ): Promise<TSecretMap> {
    const gatewayId = await resolveGatewayId(secretSync, gatewayPoolService);

    const { secrets } = await getChefSecrets(secretSync, gatewayId, gatewayV2Service);

    return Object.fromEntries(secrets.map((secret) => [secret.key, { value: secret.value }]));
  },

  async removeSecrets(
    secretSync: TChefSyncWithCredentials,
    secretMap: TSecretMap,
    gatewayV2Service: TChefSyncGatewayV2Service,
    gatewayPoolService: TChefSyncGatewayPoolService
  ) {
    const gatewayId = await resolveGatewayId(secretSync, gatewayPoolService);

    const { id, secrets: existingSecrets } = await getChefSecrets(secretSync, gatewayId, gatewayV2Service);

    const newSecrets = existingSecrets.filter((secret) => !Object.hasOwn(secretMap, secret.key));

    if (newSecrets.length === existingSecrets.length) {
      return;
    }

    const updatedSecrets = Object.fromEntries(newSecrets.map((secret) => [secret.key, secret.value]));

    await updateChefSecrets(secretSync, id, updatedSecrets, gatewayId, gatewayV2Service);
  }
};
