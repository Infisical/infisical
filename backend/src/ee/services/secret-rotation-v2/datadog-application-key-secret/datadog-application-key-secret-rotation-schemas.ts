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

export const DatadogApplicationKeySecretRotationGeneratedCredentialsSchema = z
  .object({
    applicationKeyId: z.string(),
    applicationKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const DatadogApplicationKeySecretRotationParametersSchema = z.object({
  serviceAccountId: z
    .string()
    .trim()
    .min(1, "Service Account ID required")
    .describe(SecretRotations.PARAMETERS.DATADOG_APPLICATION_KEY_SECRET.serviceAccountId)
});

const DatadogApplicationKeySecretRotationSecretsMappingSchema = z.object({
  applicationKeyId: SecretNameSchema.describe(
    SecretRotations.SECRETS_MAPPING.DATADOG_APPLICATION_KEY_SECRET.applicationKeyId
  ),
  applicationKey: SecretNameSchema.describe(
    SecretRotations.SECRETS_MAPPING.DATADOG_APPLICATION_KEY_SECRET.applicationKey
  )
});

export const DatadogApplicationKeySecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    applicationKeyId: z.string(),
    applicationKey: z.string()
  })
});

export const DatadogApplicationKeySecretRotationSchema = BaseSecretRotationSchema(
  SecretRotation.DatadogApplicationKeySecret
).extend({
  type: z.literal(SecretRotation.DatadogApplicationKeySecret),
  parameters: DatadogApplicationKeySecretRotationParametersSchema,
  secretsMapping: DatadogApplicationKeySecretRotationSecretsMappingSchema
});

export const CreateDatadogApplicationKeySecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.DatadogApplicationKeySecret
).extend({
  parameters: DatadogApplicationKeySecretRotationParametersSchema,
  secretsMapping: DatadogApplicationKeySecretRotationSecretsMappingSchema
});

export const UpdateDatadogApplicationKeySecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.DatadogApplicationKeySecret
).extend({
  parameters: DatadogApplicationKeySecretRotationParametersSchema.optional(),
  secretsMapping: DatadogApplicationKeySecretRotationSecretsMappingSchema.optional()
});

export const DatadogApplicationKeySecretRotationListItemSchema = z.object({
  name: z.literal("Datadog Application Key Secret"),
  connection: z.literal(AppConnection.Datadog),
  type: z.literal(SecretRotation.DatadogApplicationKeySecret),
  template: DatadogApplicationKeySecretRotationTemplateSchema
});
