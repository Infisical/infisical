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

export const GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH = 254;

export const GcpServiceAccountKeyRotationGeneratedCredentialsSchema = z
  .object({
    keyId: z.string(),
    serviceAccountKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const GcpServiceAccountKeyRotationParametersSchema = z.object({
  serviceAccountEmail: z
    .string()
    .trim()
    .min(1, "Service account email required")
    .max(
      GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH,
      `Service account email must be ${GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH} characters or fewer`
    )
    .email("Service account email must be a valid email address")
    .describe(SecretRotations.PARAMETERS.GCP_SERVICE_ACCOUNT_KEY.serviceAccountEmail)
});

const GcpServiceAccountKeyRotationSecretsMappingSchema = z.object({
  serviceAccountKey: SecretNameSchema.describe(
    SecretRotations.SECRETS_MAPPING.GCP_SERVICE_ACCOUNT_KEY.serviceAccountKey
  )
});

export const GcpServiceAccountKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    serviceAccountKey: z.string()
  })
});

export const GcpServiceAccountKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.GcpServiceAccountKey).extend({
  type: z.literal(SecretRotation.GcpServiceAccountKey),
  parameters: GcpServiceAccountKeyRotationParametersSchema,
  secretsMapping: GcpServiceAccountKeyRotationSecretsMappingSchema
});

export const CreateGcpServiceAccountKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.GcpServiceAccountKey
).extend({
  parameters: GcpServiceAccountKeyRotationParametersSchema,
  secretsMapping: GcpServiceAccountKeyRotationSecretsMappingSchema
});

export const UpdateGcpServiceAccountKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.GcpServiceAccountKey
).extend({
  parameters: GcpServiceAccountKeyRotationParametersSchema.optional(),
  secretsMapping: GcpServiceAccountKeyRotationSecretsMappingSchema.optional()
});

export const GcpServiceAccountKeyRotationListItemSchema = z.object({
  name: z.literal("GCP Service Account Key"),
  connection: z.literal(AppConnection.GCP),
  type: z.literal(SecretRotation.GcpServiceAccountKey),
  template: GcpServiceAccountKeyRotationTemplateSchema
});
