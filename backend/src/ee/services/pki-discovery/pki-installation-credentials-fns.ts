import { z } from "zod";

import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";

const PkiInstallationCredentialsSchema = z.object({
  keystorePassword: z.string().optional()
});

type TPkiInstallationCredentials = z.infer<typeof PkiInstallationCredentialsSchema>;

type TKmsService = TKmsCoreDomain;

export const encryptPkiInstallationCredentials = async ({
  projectId,
  credentials,
  kmsCoreDomain
}: {
  projectId: string;
  credentials: TPkiInstallationCredentials;
  kmsCoreDomain: TKmsService;
}) => {
  const { encryptor } = await kmsCoreDomain.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
  const { cipherTextBlob } = encryptor({ plainText: Buffer.from(JSON.stringify(credentials)) });
  return cipherTextBlob;
};

export const createPkiInstallationCredentialsDecryptor = async ({
  projectId,
  kmsCoreDomain
}: {
  projectId: string;
  kmsCoreDomain: TKmsService;
}) => {
  const { decryptor } = await kmsCoreDomain.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
  return (encryptedCredentials: Buffer): TPkiInstallationCredentials =>
    PkiInstallationCredentialsSchema.parse(JSON.parse(decryptor({ cipherTextBlob: encryptedCredentials }).toString()));
};
