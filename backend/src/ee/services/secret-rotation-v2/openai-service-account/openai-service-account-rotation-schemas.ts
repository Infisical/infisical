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

export const OpenAIServiceAccountRotationGeneratedCredentialsSchema = z
  .object({
    apiKey: z.string(),
    serviceAccountId: z.string()
  })
  .array()
  .min(1)
  .max(2);

/** Max length for the user-provided base name; the created service account name also gets a `-<timestamp>` suffix. */
/** The max length for the service account name is 86 characters, including the timestamp suffix. */
export const OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH = 86;

const OpenAIServiceAccountRotationParametersSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID required")
    .describe(SecretRotations.PARAMETERS.OPENAI_SERVICE_ACCOUNT.projectId),
  name: z
    .string()
    .trim()
    .min(1, "Service account name required")
    .max(
      OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH,
      `Service account name must be ${OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH} characters or fewer`
    )
    .describe(SecretRotations.PARAMETERS.OPENAI_SERVICE_ACCOUNT.name)
});

const OpenAIServiceAccountRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.OPENAI_SERVICE_ACCOUNT.apiKey)
});

export const OpenAIServiceAccountRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  })
});

export const OpenAIServiceAccountRotationSchema = BaseSecretRotationSchema(SecretRotation.OpenAIServiceAccount).extend({
  type: z.literal(SecretRotation.OpenAIServiceAccount),
  parameters: OpenAIServiceAccountRotationParametersSchema,
  secretsMapping: OpenAIServiceAccountRotationSecretsMappingSchema
});

export const CreateOpenAIServiceAccountRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.OpenAIServiceAccount
).extend({
  parameters: OpenAIServiceAccountRotationParametersSchema,
  secretsMapping: OpenAIServiceAccountRotationSecretsMappingSchema
});

export const UpdateOpenAIServiceAccountRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.OpenAIServiceAccount
).extend({
  parameters: OpenAIServiceAccountRotationParametersSchema.optional(),
  secretsMapping: OpenAIServiceAccountRotationSecretsMappingSchema.optional()
});

export const OpenAIServiceAccountRotationListItemSchema = z.object({
  name: z.literal("OpenAI Service Account"),
  connection: z.literal(AppConnection.OpenAI),
  type: z.literal(SecretRotation.OpenAIServiceAccount),
  template: OpenAIServiceAccountRotationTemplateSchema
});
