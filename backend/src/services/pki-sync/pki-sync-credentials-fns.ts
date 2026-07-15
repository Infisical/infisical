import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export type TPkiSyncCredentials = {
  exportPassword?: string;
};

type TKmsService = Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

export const encryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  credentials,
  kmsService
}: {
  orgId: string;
  projectId: string | null | undefined;
  credentials: TPkiSyncCredentials;
  kmsService: TKmsService;
}): Promise<Buffer> => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

export const decryptPkiSyncCredentials = async ({
  orgId,
  projectId,
  encryptedCredentials,
  kmsService
}: {
  orgId: string;
  projectId: string | null | undefined;
  encryptedCredentials: Buffer;
  kmsService: TKmsService;
}): Promise<TPkiSyncCredentials> => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey(
    projectId ? { type: KmsDataKey.SecretManager, projectId } : { type: KmsDataKey.Organization, orgId }
  );

  const decrypted = decryptor({ cipherTextBlob: encryptedCredentials });
  return JSON.parse(decrypted.toString()) as TPkiSyncCredentials;
};
