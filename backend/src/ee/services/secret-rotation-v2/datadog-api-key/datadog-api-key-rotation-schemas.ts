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

/** Datadog does not publish a strict maximum length for API key names; cap for sanity. */
export const DATADOG_API_KEY_NAME_MAX_LENGTH = 255;

export const DatadogApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    apiKeyId: z.string(),
    apiKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const DatadogApiKeyRotationParametersSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name required")
    .max(DATADOG_API_KEY_NAME_MAX_LENGTH, `Key name must be ${DATADOG_API_KEY_NAME_MAX_LENGTH} characters or fewer`)
    .describe(SecretRotations.PARAMETERS.DATADOG_API_KEY.name)
});

const DatadogApiKeyRotationSecretsMappingSchema = z.object({
  apiKeyId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.DATADOG_API_KEY.apiKeyId),
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.DATADOG_API_KEY.apiKey)
});

export const DatadogApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKeyId: z.string(),
    apiKey: z.string()
  })
});

export const DatadogApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.DatadogApiKey).extend({
  type: z.literal(SecretRotation.DatadogApiKey),
  parameters: DatadogApiKeyRotationParametersSchema,
  secretsMapping: DatadogApiKeyRotationSecretsMappingSchema
});

export const CreateDatadogApiKeyRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.DatadogApiKey).extend({
  parameters: DatadogApiKeyRotationParametersSchema,
  secretsMapping: DatadogApiKeyRotationSecretsMappingSchema
});

export const UpdateDatadogApiKeyRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.DatadogApiKey).extend({
  parameters: DatadogApiKeyRotationParametersSchema.optional(),
  secretsMapping: DatadogApiKeyRotationSecretsMappingSchema.optional()
});

export const DatadogApiKeyRotationListItemSchema = z.object({
  name: z.literal("Datadog API Key"),
  connection: z.literal(AppConnection.Datadog),
  type: z.literal(SecretRotation.DatadogApiKey),
  template: DatadogApiKeyRotationTemplateSchema
});
