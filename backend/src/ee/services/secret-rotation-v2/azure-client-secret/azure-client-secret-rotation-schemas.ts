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

export const AzureClientSecretRotationGeneratedCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string()
  })
  .array()
  .min(1)
  .max(2);

const AzureClientSecretRotationParametersSchema = z.object({
  appId: z.string().trim().min(1, "App ID Required").describe(SecretRotations.PARAMETERS.AZURE_CLIENT_SECRET.appId),
  appName: z.string().trim().describe(SecretRotations.PARAMETERS.AZURE_CLIENT_SECRET.appName).optional()
});

const AzureClientSecretRotationSecretsMappingSchema = z.object({
  clientId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AZURE_CLIENT_SECRET.clientId),
  clientSecret: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AZURE_CLIENT_SECRET.clientSecret)
});

export const AzureClientSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    clientId: z.string(),
    clientSecret: z.string()
  })
});

export const AzureClientSecretRotationSchema = BaseSecretRotationSchema(SecretRotation.AzureClientSecret).extend({
  type: z.literal(SecretRotation.AzureClientSecret),
  parameters: AzureClientSecretRotationParametersSchema,
  secretsMapping: AzureClientSecretRotationSecretsMappingSchema
});

export const CreateAzureClientSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.AzureClientSecret
).extend({
  parameters: AzureClientSecretRotationParametersSchema,
  secretsMapping: AzureClientSecretRotationSecretsMappingSchema
});

export const UpdateAzureClientSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.AzureClientSecret
).extend({
  parameters: AzureClientSecretRotationParametersSchema.optional(),
  secretsMapping: AzureClientSecretRotationSecretsMappingSchema.optional()
});

export const AzureClientSecretRotationListItemSchema = z.object({
  name: z.literal("Azure Client Secret"),
  connection: z.literal(AppConnection.AzureClientSecrets),
  type: z.literal(SecretRotation.AzureClientSecret),
  template: AzureClientSecretRotationTemplateSchema
});
