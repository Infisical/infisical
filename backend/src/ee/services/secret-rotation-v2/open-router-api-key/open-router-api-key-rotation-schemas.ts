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

export const OpenRouterApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    apiKey: z.string(),
    keyHash: z.string()
  })
  .array()
  .min(1)
  .max(2);

export enum OpenRouterLimitReset {
  Daily = "daily",
  Weekly = "weekly",
  Monthly = "monthly"
}

/** Max length for OpenRouter API key name. OpenRouter docs only require >=1 char; we cap at 100 for sanity checks. */
export const OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH = 100;

const OpenRouterApiKeyRotationParametersSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name required")
    .max(
      OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH,
      `Key name must be ${OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH} characters or fewer`
    )
    .describe(SecretRotations.PARAMETERS.OPEN_ROUTER_API_KEY.name),
  limit: z.number().positive().optional().nullable().describe(SecretRotations.PARAMETERS.OPEN_ROUTER_API_KEY.limit),
  limitReset: z
    .nativeEnum(OpenRouterLimitReset)
    .optional()
    .nullable()
    .describe(SecretRotations.PARAMETERS.OPEN_ROUTER_API_KEY.limitReset),
  includeByokInLimit: z
    .boolean()
    .optional()
    .nullable()
    .describe(SecretRotations.PARAMETERS.OPEN_ROUTER_API_KEY.includeByokInLimit)
});

const OpenRouterApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.OPEN_ROUTER_API_KEY.apiKey)
});

export const OpenRouterApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  })
});

export const OpenRouterApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.OpenRouterApiKey).extend({
  type: z.literal(SecretRotation.OpenRouterApiKey),
  parameters: OpenRouterApiKeyRotationParametersSchema,
  secretsMapping: OpenRouterApiKeyRotationSecretsMappingSchema
});

export const CreateOpenRouterApiKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.OpenRouterApiKey
).extend({
  parameters: OpenRouterApiKeyRotationParametersSchema,
  secretsMapping: OpenRouterApiKeyRotationSecretsMappingSchema
});

export const UpdateOpenRouterApiKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.OpenRouterApiKey
).extend({
  parameters: OpenRouterApiKeyRotationParametersSchema.optional(),
  secretsMapping: OpenRouterApiKeyRotationSecretsMappingSchema.optional()
});

export const OpenRouterApiKeyRotationListItemSchema = z.object({
  name: z.literal("OpenRouter API Key"),
  connection: z.literal(AppConnection.OpenRouter),
  type: z.literal(SecretRotation.OpenRouterApiKey),
  template: OpenRouterApiKeyRotationTemplateSchema
});
