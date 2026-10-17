import { z } from "zod";

import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

const PkiInstallationCredentialsSchema = z.object({
  keystorePassword: z.string().optional()
});

type TPkiInstallationCredentials = z.infer<typeof PkiInstallationCredentialsSchema>;

type TKmsService = Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

export const encryptPkiInstallationCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: TPkiInstallationCredentials;
  kmsService: TKmsService;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

export const createPkiInstallationCredentialsDecryptor = async ({
  projectId,
  kmsService
}: {
  projectId: string;
  kmsService: TKmsService;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
  return (encryptedCredentials: Buffer): TPkiInstallationCredentials =>
    PkiInstallationCredentialsSchema.parse(JSON.parse(decryptor({ cipherTextBlob: encryptedCredentials }).toString()));
};
