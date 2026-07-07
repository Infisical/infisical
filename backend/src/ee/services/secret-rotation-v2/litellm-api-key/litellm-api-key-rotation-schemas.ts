import { z } from "zod";

import { LITELLM_RESERVED_KEY_OPTIONS } from "@app/ee/services/secret-rotation-v2/litellm-api-key/litellm-api-key-rotation-constants";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const LiteLLMApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    apiKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

/** Max length for the user-provided key name. Infisical appends a timestamp, so this is a sanity cap. */
export const LITELLM_API_KEY_NAME_MAX_LENGTH = 100;

const AdditionalOptionsSchema = z
  .string()
  .trim()
  .optional()
  .superRefine((val, ctx) => {
    if (!val) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Additional options must be valid JSON." });
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Additional options must be a JSON object." });
      return;
    }

    const reservedKeys = Object.keys(parsed).filter((key) => LITELLM_RESERVED_KEY_OPTIONS.includes(key));
    if (reservedKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The following options are managed by Infisical and cannot be set: ${reservedKeys.join(", ")}.`
      });
    }
  });

const LiteLLMApiKeyRotationParametersSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name required")
    .max(LITELLM_API_KEY_NAME_MAX_LENGTH, `Key name must be ${LITELLM_API_KEY_NAME_MAX_LENGTH} characters or fewer`)
    .describe(SecretRotations.PARAMETERS.LITELLM_API_KEY.name),
  additionalOptions: AdditionalOptionsSchema.describe(SecretRotations.PARAMETERS.LITELLM_API_KEY.additionalOptions),
  userId: z.string().trim().optional().describe(SecretRotations.PARAMETERS.LITELLM_API_KEY.userId),
  teamId: z.string().trim().optional().describe(SecretRotations.PARAMETERS.LITELLM_API_KEY.teamId),
  models: z.string().trim().array().optional().describe(SecretRotations.PARAMETERS.LITELLM_API_KEY.models)
});

const LiteLLMApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.LITELLM_API_KEY.apiKey)
});

export const LiteLLMApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  })
});

export const LiteLLMApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.LiteLLMApiKey).extend({
  type: z.literal(SecretRotation.LiteLLMApiKey),
  parameters: LiteLLMApiKeyRotationParametersSchema,
  secretsMapping: LiteLLMApiKeyRotationSecretsMappingSchema
});

export const CreateLiteLLMApiKeyRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.LiteLLMApiKey).extend({
  parameters: LiteLLMApiKeyRotationParametersSchema,
  secretsMapping: LiteLLMApiKeyRotationSecretsMappingSchema
});

export const UpdateLiteLLMApiKeyRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.LiteLLMApiKey).extend({
  parameters: LiteLLMApiKeyRotationParametersSchema.optional(),
  secretsMapping: LiteLLMApiKeyRotationSecretsMappingSchema.optional()
});

export const LiteLLMApiKeyRotationListItemSchema = z.object({
  name: z.literal("LiteLLM API Key"),
  connection: z.literal(AppConnection.LiteLLM),
  type: z.literal(SecretRotation.LiteLLMApiKey),
  template: LiteLLMApiKeyRotationTemplateSchema
});
