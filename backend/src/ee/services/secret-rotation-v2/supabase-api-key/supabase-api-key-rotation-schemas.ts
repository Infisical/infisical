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

export const SupabaseApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    apiKey: z.string(),
    keyId: z.string()
  })
  .array()
  .min(1)
  .max(2);

export enum SupabaseApiKeyType {
  Publishable = "publishable",
  Secret = "secret"
}

const SupabaseApiKeyRotationParametersSchema = z.object({
  projectRef: z
    .string()
    .trim()
    .min(1, "Project reference required")
    .describe(SecretRotations.PARAMETERS.SUPABASE_API_KEY.projectRef),
  keyType: z.nativeEnum(SupabaseApiKeyType).describe(SecretRotations.PARAMETERS.SUPABASE_API_KEY.keyType)
});

const SupabaseApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SUPABASE_API_KEY.apiKey)
});

export const SupabaseApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  })
});

export const SupabaseApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.SupabaseApiKey).extend({
  type: z.literal(SecretRotation.SupabaseApiKey),
  parameters: SupabaseApiKeyRotationParametersSchema,
  secretsMapping: SupabaseApiKeyRotationSecretsMappingSchema
});

export const CreateSupabaseApiKeyRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.SupabaseApiKey).extend({
  parameters: SupabaseApiKeyRotationParametersSchema,
  secretsMapping: SupabaseApiKeyRotationSecretsMappingSchema
});

export const UpdateSupabaseApiKeyRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.SupabaseApiKey).extend({
  parameters: SupabaseApiKeyRotationParametersSchema.optional(),
  secretsMapping: SupabaseApiKeyRotationSecretsMappingSchema.optional()
});

export const SupabaseApiKeyRotationListItemSchema = z.object({
  name: z.literal("Supabase API Key"),
  connection: z.literal(AppConnection.Supabase),
  type: z.literal(SecretRotation.SupabaseApiKey),
  template: SupabaseApiKeyRotationTemplateSchema
});
