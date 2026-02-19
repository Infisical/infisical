import { TPamDiscoverySources } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { getActiveDirectorySourceListItem } from "./active-directory/active-directory-discovery-fns";
import { TPamDiscoveryConfiguration, TPamDiscoveryCredentials, TPamDiscoverySource } from "./pam-discovery-types";

export const listDiscoverySourceOptions = () => {
  return [getActiveDirectorySourceListItem()].sort((a, b) => a.name.localeCompare(b.name));
};

export const encryptDiscoveryCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: TPamDiscoveryCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return cipherTextBlob;
};

export const decryptDiscoveryCredentials = async ({
  projectId,
  encryptedCredentials,
  kmsService
}: {
  projectId: string;
  encryptedCredentials: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamDiscoveryCredentials;
};

export const decryptDiscoverySource = async (
  source: TPamDiscoverySources,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  return {
    ...source,
    discoveryConfiguration: source.discoveryConfiguration as TPamDiscoveryConfiguration,
    discoveryCredentials: source.encryptedDiscoveryCredentials
      ? await decryptDiscoveryCredentials({
          encryptedCredentials: source.encryptedDiscoveryCredentials,
          projectId,
          kmsService
        })
      : null
  } as TPamDiscoverySource;
};
