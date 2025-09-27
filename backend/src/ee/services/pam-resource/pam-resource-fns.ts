import { TPamResources } from "@app/db/schemas";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamAccountCredentials, TPamResource, TPamResourceConnectionDetails } from "./pam-resource-types";
import { getPostgresResourceListItem } from "./postgres/postgres-resource-fns";

export const listResourceOptions = () => {
  return [getPostgresResourceListItem()].sort((a, b) => a.name.localeCompare(b.name));
};

// Resource
export const encryptResourceConnectionDetails = async ({
  orgId,
  connectionDetails,
  kmsService
}: {
  orgId: string;
  connectionDetails: TPamResourceConnectionDetails;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob: encryptedConnectionDetailsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(connectionDetails))
  });

  return encryptedConnectionDetailsBlob;
};

export const decryptResourceConnectionDetails = async ({
  orgId,
  encryptedConnectionDetails,
  kmsService
}: {
  orgId: string;
  encryptedConnectionDetails: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedConnectionDetails
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamResourceConnectionDetails;
};

export const decryptResource = async (
  resource: TPamResources,
  orgId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  return {
    ...resource,
    connectionDetails: await decryptResourceConnectionDetails({
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      orgId,
      kmsService
    })
  } as TPamResource;
};

// Account
export const encryptAccountCredentials = async ({
  orgId,
  credentials,
  kmsService
}: {
  orgId: string;
  credentials: TPamAccountCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAccountCredentials = async ({
  orgId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  encryptedCredentials: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamAccountCredentials;
};

export const decryptAccount = async <T extends { encryptedCredentials: Buffer }>(
  account: T,
  orgId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<T & { credentials: TPamAccountCredentials }> => {
  return {
    ...account,
    credentials: await decryptAccountCredentials({
      encryptedCredentials: account.encryptedCredentials,
      orgId,
      kmsService
    })
  } as T & { credentials: TPamAccountCredentials };
};
