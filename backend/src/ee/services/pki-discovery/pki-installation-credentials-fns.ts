import { z } from "zod";

import { KmsDataKey, TDataKeyService } from "@app/domains/platform/kms-core/ce/module";

const PkiInstallationCredentialsSchema = z.object({
  keystorePassword: z.string().optional()
});

type TPkiInstallationCredentials = z.infer<typeof PkiInstallationCredentialsSchema>;

export const encryptPkiInstallationCredentials = async ({
  projectId,
  credentials,
  kmsDataKeyService
}: {
  projectId: string;
  credentials: TPkiInstallationCredentials;
  kmsDataKeyService: TDataKeyService;
}) => {
  const { encryptor } = await kmsDataKeyService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

export const createPkiInstallationCredentialsDecryptor = async ({
  projectId,
  kmsDataKeyService
}: {
  projectId: string;
  kmsDataKeyService: TDataKeyService;
}) => {
  const { decryptor } = await kmsDataKeyService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  return (encryptedCredentials: Buffer): TPkiInstallationCredentials =>
    PkiInstallationCredentialsSchema.parse(JSON.parse(decryptor({ cipherTextBlob: encryptedCredentials }).toString()));
};
