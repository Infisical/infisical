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

export const OpenAIAdminApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    apiKey: z.string(),
    keyId: z.string()
  })
  .array()
  .min(1)
  .max(2);

/** Max length for the user-provided base name; the created key name also gets a `-<timestamp>` suffix. */
export const OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH = 100;

const OpenAIAdminApiKeyRotationParametersSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name required")
    .max(
      OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH,
      `Key name must be ${OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH} characters or fewer`
    )
    .describe(SecretRotations.PARAMETERS.OPENAI_ADMIN_API_KEY.name)
});

const OpenAIAdminApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.OPENAI_ADMIN_API_KEY.apiKey)
});

export const OpenAIAdminApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  })
});

export const OpenAIAdminApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.OpenAIAdminApiKey).extend({
  type: z.literal(SecretRotation.OpenAIAdminApiKey),
  parameters: OpenAIAdminApiKeyRotationParametersSchema,
  secretsMapping: OpenAIAdminApiKeyRotationSecretsMappingSchema
});

export const CreateOpenAIAdminApiKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.OpenAIAdminApiKey
).extend({
  parameters: OpenAIAdminApiKeyRotationParametersSchema,
  secretsMapping: OpenAIAdminApiKeyRotationSecretsMappingSchema
});

export const UpdateOpenAIAdminApiKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.OpenAIAdminApiKey
).extend({
  parameters: OpenAIAdminApiKeyRotationParametersSchema.optional(),
  secretsMapping: OpenAIAdminApiKeyRotationSecretsMappingSchema.optional()
});

export const OpenAIAdminApiKeyRotationListItemSchema = z.object({
  name: z.literal("OpenAI Admin API Key"),
  connection: z.literal(AppConnection.OpenAI),
  type: z.literal(SecretRotation.OpenAIAdminApiKey),
  template: OpenAIAdminApiKeyRotationTemplateSchema
});
