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

export const FireworksApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    secretName: z.string(),
    secretValue: z.string()
  })
  .array()
  .min(1)
  .max(2);

const FireworksApiKeyRotationParametersSchema = z.object({
  keyName: z.string().trim().min(1, "Key name required").describe(SecretRotations.PARAMETERS.FIREWORKS_API_KEY.keyName)
});

const FireworksApiKeyRotationSecretsMappingSchema = z.object({
  secretValue: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.FIREWORKS_API_KEY.secretValue)
});

export const FireworksApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    secretValue: z.string()
  })
});

export const FireworksApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.FireworksApiKey).extend({
  type: z.literal(SecretRotation.FireworksApiKey),
  parameters: FireworksApiKeyRotationParametersSchema,
  secretsMapping: FireworksApiKeyRotationSecretsMappingSchema
});

export const CreateFireworksApiKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.FireworksApiKey
).extend({
  parameters: FireworksApiKeyRotationParametersSchema,
  secretsMapping: FireworksApiKeyRotationSecretsMappingSchema
});

export const UpdateFireworksApiKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.FireworksApiKey
).extend({
  parameters: FireworksApiKeyRotationParametersSchema.optional(),
  secretsMapping: FireworksApiKeyRotationSecretsMappingSchema.optional()
});

export const FireworksApiKeyRotationListItemSchema = z.object({
  name: z.literal("Fireworks Secret"),
  connection: z.literal(AppConnection.Fireworks),
  type: z.literal(SecretRotation.FireworksApiKey),
  template: FireworksApiKeyRotationTemplateSchema
});
