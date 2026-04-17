import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamDomainConnectionDetails } from "./pam-domain-types";

export const encryptDomainConnectionDetails = async ({
  projectId,
  connectionDetails,
  kmsService
}: {
  projectId: string;
  connectionDetails: TPamDomainConnectionDetails;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(connectionDetails))
  });

  return cipherTextBlob;
};

export const decryptDomainConnectionDetails = async ({
  projectId,
  encryptedConnectionDetails,
  kmsService
}: {
  projectId: string;
  encryptedConnectionDetails: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedConnectionDetails
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamDomainConnectionDetails;
};
