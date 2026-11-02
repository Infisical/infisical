import { z } from "zod";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

import type { THsmConnectorServiceFactoryDep } from "./hsm-connector-service";
import type { THsmConnectorCredentials } from "./hsm-connector-types";

const HSM_KEY_LABEL_MAX_BYTES = 256;

export const HsmKeyLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= HSM_KEY_LABEL_MAX_BYTES,
    `Key label must be at most ${HSM_KEY_LABEL_MAX_BYTES} bytes`
  );

export enum HsmGatewayCapability {
  MlDsa = "pkcs11MlDsa"
}

const HSM_KEY_ALGORITHM_BY_CERT_KEY_ALGORITHM: Partial<Record<string, HsmKeyAlgorithm>> = {
  [CertKeyAlgorithm.RSA_2048]: HsmKeyAlgorithm.RSA_2048,
  [CertKeyAlgorithm.RSA_3072]: HsmKeyAlgorithm.RSA_3072,
  [CertKeyAlgorithm.RSA_4096]: HsmKeyAlgorithm.RSA_4096,
  [CertKeyAlgorithm.ECDSA_P256]: HsmKeyAlgorithm.ECC_P256,
  [CertKeyAlgorithm.ECDSA_P384]: HsmKeyAlgorithm.ECC_P384,
  [CertKeyAlgorithm.ML_DSA_44]: HsmKeyAlgorithm.ML_DSA_44,
  [CertKeyAlgorithm.ML_DSA_65]: HsmKeyAlgorithm.ML_DSA_65,
  [CertKeyAlgorithm.ML_DSA_87]: HsmKeyAlgorithm.ML_DSA_87
};

export const certKeyAlgorithmToHsmKeyAlgorithm = (keyAlgorithm: string): HsmKeyAlgorithm | undefined =>
  HSM_KEY_ALGORITHM_BY_CERT_KEY_ALGORITHM[keyAlgorithm];

export const HSM_CREDENTIALS_LIMITS = {
  slotLabelMax: 128,
  pinMax: 512,
  keyNamePrefixMax: 64
} as const;

export const HsmConnectorCredentialsSchema = z.object({
  slotLabel: z.string().min(1).max(HSM_CREDENTIALS_LIMITS.slotLabelMax),
  pin: z.string().min(1).max(HSM_CREDENTIALS_LIMITS.pinMax),
  keyNamePrefix: z.string().min(1).max(HSM_CREDENTIALS_LIMITS.keyNamePrefixMax).optional()
});

export type THsmConnectorCredentialsSchemaType = z.infer<typeof HsmConnectorCredentialsSchema>;

export const encryptHsmConnectorCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: THsmConnectorCredentials;
  kmsService: THsmConnectorServiceFactoryDep["kmsService"];
}): Promise<Buffer> => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });
  return cipherTextBlob;
};

export const decryptHsmConnectorCredentials = async ({
  projectId,
  encryptedCredentials,
  kmsService
}: {
  projectId: string;
  encryptedCredentials: Buffer;
  kmsService: THsmConnectorServiceFactoryDep["kmsService"];
}): Promise<THsmConnectorCredentials> => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  const plainText = decryptor({ cipherTextBlob: encryptedCredentials });
  return HsmConnectorCredentialsSchema.parse(JSON.parse(plainText.toString()));
};

export const HsmConnectorSanitizedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  projectId: z.string(),
  gatewayId: z.string().uuid().nullable(),
  gatewayPoolId: z.string().uuid().nullable(),
  slotLabel: z.string(),
  keyNamePrefix: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});
