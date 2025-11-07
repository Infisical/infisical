import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";

export const encryptAccountCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: TPamAccountCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptAccountCredentials = async ({
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

  return JSON.parse(decryptedPlainTextBlob.toString()) as TPamAccountCredentials;
};

export const decryptAccountMessage = async ({
  projectId,
  encryptedMessage,
  kmsService
}: {
  projectId: string;
  encryptedMessage: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedMessage
  });

  return decryptedPlainTextBlob.toString();
};

export const decryptAccount = async <
  T extends { encryptedCredentials: Buffer; encryptedLastRotationMessage?: Buffer | null }
>(
  account: T,
  projectId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<T & { credentials: TPamAccountCredentials; lastRotationMessage: string | null }> => {
  return {
    ...account,
    credentials: await decryptAccountCredentials({
      encryptedCredentials: account.encryptedCredentials,
      projectId,
      kmsService
    }),
    lastRotationMessage: account.encryptedLastRotationMessage
      ? await decryptAccountMessage({
          encryptedMessage: account.encryptedLastRotationMessage,
          projectId,
          kmsService
        })
      : null
  };
};
