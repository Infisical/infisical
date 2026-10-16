import { getChefDataBagItem, updateChefDataBagItem } from "@app/ee/services/app-connections/chef";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { crypto } from "@app/lib/crypto";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TPreSaveTransformDestinationConfigFn, TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import {
  ChefSecret,
  TChefDataBagItemContent,
  TChefEncryptedValue,
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

// An update replaces the whole destination config, so without this a client that doesn't send
// shouldEncryptSecrets would turn encryption off and the next sync would write plain text.
export const chefPreSaveTransformDestinationConfig: TPreSaveTransformDestinationConfigFn = async ({
  destinationConfig,
  existingDestinationConfig
}) => {
  if (!destinationConfig || destinationConfig.shouldEncryptSecrets !== undefined) return destinationConfig;
  if (existingDestinationConfig?.shouldEncryptSecrets === undefined) return destinationConfig;

  return { ...destinationConfig, shouldEncryptSecrets: existingDestinationConfig.shouldEncryptSecrets };
};

const CHEF_ENCRYPTED_DATA_BAG_VERSION = 3;
const CHEF_ENCRYPTED_DATA_BAG_CIPHER = "aes-256-gcm";
const CHEF_ENCRYPTED_DATA_BAG_IV_BYTES = 12;

// Chef derives the cipher key from the SHA-256 of the shared secret and wraps each value as
// {"json_wrapper": value}; matching both is what lets knife and cookbooks decrypt what we write.
const getDataBagKey = (dataBagSecret: string) =>
  crypto.nativeCrypto.createHash("sha256").update(dataBagSecret).digest();

const isEncryptedValue = (value: unknown): value is TChefEncryptedValue =>
  typeof value === "object" && value !== null && "encrypted_data" in value;

const encryptValue = (value: TChefSecret, key: Buffer): TChefEncryptedValue => {
  const iv = crypto.randomBytes(CHEF_ENCRYPTED_DATA_BAG_IV_BYTES);
  const cipher = crypto.nativeCrypto.createCipheriv(CHEF_ENCRYPTED_DATA_BAG_CIPHER, key, iv);
  const encryptedData = Buffer.concat([cipher.update(JSON.stringify({ json_wrapper: value }), "utf8"), cipher.final()]);

  return {
    encrypted_data: encryptedData.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    version: CHEF_ENCRYPTED_DATA_BAG_VERSION,
    cipher: CHEF_ENCRYPTED_DATA_BAG_CIPHER
  };
};

const decryptValue = (secretKey: string, value: TChefEncryptedValue, secretSync: TChefSyncWithCredentials) => {
  const { dataBagName, dataBagItemName } = secretSync.destinationConfig;
  const { dataBagSecret } = secretSync.connection.credentials;
  const itemLabel = `"${dataBagName}/${dataBagItemName}"`;

  if (!dataBagSecret) {
    throw new SecretSyncError({
      message: `Chef data bag item ${itemLabel} is encrypted. Add the data bag secret it was encrypted with to the sync's Chef connection.`,
      shouldRetry: false
    });
  }

  if (value.version !== CHEF_ENCRYPTED_DATA_BAG_VERSION) {
    throw new SecretSyncError({
      message: `Value "${secretKey}" in Chef data bag item ${itemLabel} uses encrypted data bag version ${value.version}. Infisical supports only version 3, the default since Chef Infra Client 13. Re-encrypt the item with version 3.`,
      shouldRetry: false
    });
  }

  try {
    const decipher = crypto.nativeCrypto.createDecipheriv(
      CHEF_ENCRYPTED_DATA_BAG_CIPHER,
      getDataBagKey(dataBagSecret),
      Buffer.from(value.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(value.auth_tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.encrypted_data, "base64")),
      decipher.final()
    ]).toString("utf8");

    return (JSON.parse(plaintext) as { json_wrapper: TChefSecret }).json_wrapper;
  } catch {
    throw new SecretSyncError({
      message: `Couldn't decrypt value "${secretKey}" in Chef data bag item ${itemLabel}. Check that the data bag secret on the sync's Chef connection is the one the item was encrypted with.`,
      shouldRetry: false
    });
  }
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
  Object.entries(existingSecrets).forEach(([key, rawValue]) => {
    const value = isEncryptedValue(rawValue) ? decryptValue(key, rawValue, secretSync) : rawValue;
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
    destinationConfig: { dataBagName, dataBagItemName, shouldEncryptSecrets }
  } = secretSync;

  const { serverUrl, userName, privateKey, orgName, dataBagSecret } = connection.credentials;

  let values: Record<string, TChefSecret | TChefEncryptedValue> = secrets;

  if (shouldEncryptSecrets) {
    if (!dataBagSecret) {
      throw new SecretSyncError({
        message:
          "Encryption is turned on for this sync, but its Chef connection has no data bag secret. Add the secret to the connection, or turn off encryption for this sync.",
        shouldRetry: false
      });
    }

    const key = getDataBagKey(dataBagSecret);
    values = Object.fromEntries(
      Object.entries(secrets).map(([secretKey, value]) => [secretKey, encryptValue(value, key)])
    );
  }

  // Chef data bag items must have an 'id' field
  const dataBagItemContent: TChefDataBagItemContent = {
    id,
    ...values
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
    payload: TSecretSyncPayload,
    gatewayV2Service: TChefSyncGatewayV2Service,
    gatewayPoolService: TChefSyncGatewayPoolService
  ) {
    const secretMap = payload.flatten();

    if (Object.hasOwn(secretMap, "id")) {
      throw new SecretSyncError({
        message:
          'Secret key "id" is reserved by Chef data bag items and cannot be synced. Rename the secret to sync it.',
        secretKey: "id",
        shouldRetry: false
      });
    }

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
    payload: TSecretSyncPayload,
    gatewayV2Service: TChefSyncGatewayV2Service,
    gatewayPoolService: TChefSyncGatewayPoolService
  ) {
    const secretMap = payload.flatten();
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
