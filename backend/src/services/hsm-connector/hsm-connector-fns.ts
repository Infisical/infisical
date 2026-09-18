import { z } from "zod";

import { KmsDataKey } from "@app/services/kms/kms-types";

import type { THsmConnectorServiceFactoryDep } from "./hsm-connector-service";
import type { THsmConnectorCredentials } from "./hsm-connector-types";

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
