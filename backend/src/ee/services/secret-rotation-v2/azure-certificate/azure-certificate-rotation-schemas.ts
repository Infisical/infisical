import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const AzureCertificateRotationGeneratedCredentialsSchema = z
  .object({
    publicKey: z.string().describe("Base64 encoded X.509 certificate"),
    privateKey: z.string().describe("PEM formatted private key"),
    keyId: z.string().optional().describe("Azure certificate key ID for tracking")
  })
  .array()
  .min(1)
  .max(2);

const AzureCertificateRotationParametersSchema = z.object({
  objectId: z
    .string()
    .trim()
    .min(1, "Object ID Required")
    .describe(SecretRotations.PARAMETERS.AZURE_CERTIFICATE.objectId),
  appName: z.string().trim().describe(SecretRotations.PARAMETERS.AZURE_CERTIFICATE.appName).optional(),
  privateKey: z
    .string()
    .trim()
    .describe("Optional private key in PEM format. If provided, only the certificate will be generated.")
    .optional(),
  distinguishedName: z
    .string()
    .trim()
    .describe("Certificate distinguished name (DN). If not provided, will use CN with appName or default.")
    .optional(),
  keyAlgorithm: z
    .enum(["RSA_2048", "RSA_4096", "ECDSA_P256", "ECDSA_P384"])
    .describe("Key algorithm for certificate generation")
    .default("RSA_2048")
    .optional()
});

const AzureCertificateRotationSecretsMappingSchema = z.object({
  publicKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AZURE_CERTIFICATE.certificate),
  privateKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AZURE_CERTIFICATE.privateKey)
});

export const AzureCertificateRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    publicKey: z.string(),
    privateKey: z.string()
  })
});

export const AzureCertificateRotationSchema = BaseSecretRotationSchema(SecretRotation.AzureCertificate).extend({
  type: z.literal(SecretRotation.AzureCertificate),
  parameters: AzureCertificateRotationParametersSchema,
  secretsMapping: AzureCertificateRotationSecretsMappingSchema
});

export const CreateAzureCertificateRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.AzureCertificate
).extend({
  parameters: AzureCertificateRotationParametersSchema,
  secretsMapping: AzureCertificateRotationSecretsMappingSchema
});

export const UpdateAzureCertificateRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.AzureCertificate
).extend({
  parameters: AzureCertificateRotationParametersSchema.optional(),
  secretsMapping: AzureCertificateRotationSecretsMappingSchema.optional()
});

export const AzureCertificateRotationListItemSchema = z.object({
  name: z.literal("Azure Certificate"),
  connection: z.literal(AppConnection.AzureCertificate),
  type: z.literal(SecretRotation.AzureCertificate),
  template: AzureCertificateRotationTemplateSchema
});
