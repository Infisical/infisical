import { KeyManagementServiceClient } from "@google-cloud/kms";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ExternalKmsGcpSchema, TExternalKmsGcpClientSchema, TExternalKmsProviderFns } from "./model";

const getGcpKmsClient = async ({ credential, gcpRegion }: TExternalKmsGcpClientSchema) => {
  const gcpKmsClient = new KeyManagementServiceClient({
    credentials: credential
  });
  const projectId = credential.project_id;
  const locationName = gcpKmsClient.locationPath(projectId, gcpRegion);

  return {
    gcpKmsClient,
    locationName
  };
};

type GcpKmsProviderArgs = {
  inputs: unknown;
};
type TGcpKmsProviderFactoryReturn = TExternalKmsProviderFns & {
  getKeysList: () => Promise<{ keys: string[] }>;
};

export const GcpKmsProviderFactory = async ({ inputs }: GcpKmsProviderArgs): Promise<TGcpKmsProviderFactoryReturn> => {
  const { credential, gcpRegion, keyName } = await ExternalKmsGcpSchema.parseAsync(inputs);
  const { gcpKmsClient, locationName } = await getGcpKmsClient({
    credential,
    gcpRegion
  });

  const validateConnection = async () => {
    try {
      await gcpKmsClient.listKeyRings({
        parent: locationName
      });
      return true;
    } catch (error) {
      throw new BadRequestError({
        message: "Cannot connect to GCP KMS"
      });
    }
  };

  // Used when adding the KMS to fetch the list of keys in specified region
  const getKeysList = async () => {
    try {
      const [keyRings] = await gcpKmsClient.listKeyRings({
        parent: locationName
      });

      const validKeyRings = keyRings
        .filter(
          (keyRing): keyRing is { name: string } =>
            keyRing !== null && typeof keyRing === "object" && "name" in keyRing && typeof keyRing.name === "string"
        )
        .map((keyRing) => keyRing.name);
      const keyList: string[] = [];
      const keyListPromises = validKeyRings.map((keyRingName) =>
        gcpKmsClient
          .listCryptoKeys({
            parent: keyRingName
          })
          .then(([cryptoKeys]) =>
            cryptoKeys
              .filter(
                (key): key is { name: string } =>
                  key !== null && typeof key === "object" && "name" in key && typeof key.name === "string"
              )
              .map((key) => key.name)
          )
      );

      const cryptoKeyLists = await Promise.all(keyListPromises);
      keyList.push(...cryptoKeyLists.flat());
      return { keys: keyList };
    } catch (error) {
      logger.error(error, "Could not validate GCP KMS connection and credentials");
      throw new BadRequestError({
        message: "Could not validate GCP KMS connection and credentials",
        error
      });
    }
  };

  const encrypt = async (data: Buffer) => {
    const encryptedText = await gcpKmsClient.encrypt({
      name: keyName,
      plaintext: data
    });
    if (!encryptedText[0].ciphertext) throw new Error("encryption failed");
    return { encryptedBlob: Buffer.from(encryptedText[0].ciphertext as Uint8Array) };
  };

  const decrypt = async (encryptedBlob: Buffer) => {
    const decryptedText = await gcpKmsClient.decrypt({
      name: keyName,
      ciphertext: encryptedBlob
    });
    if (!decryptedText[0].plaintext) throw new Error("decryption failed");
    return { data: Buffer.from(decryptedText[0].plaintext as Uint8Array) };
  };

  return {
    validateConnection,
    getKeysList,
    encrypt,
    decrypt
  };
};
