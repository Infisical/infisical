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

export const ConvexAccessKeyRotationGeneratedCredentialsSchema = z
  .object({
    accessKeyId: z.string(),
    accessKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const ConvexAccessKeyRotationParametersSchema = z.object({
  namePrefix: z
    .string()
    .trim()
    .min(1, "Name Prefix required")
    .describe(SecretRotations.PARAMETERS.CONVEX_ACCESS_KEY.namePrefix)
});

const ConvexAccessKeyRotationSecretsMappingSchema = z.object({
  accessKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CONVEX_ACCESS_KEY.accessKey)
});

export const ConvexAccessKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    accessKey: z.string()
  })
});

export const ConvexAccessKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.ConvexAccessKey).extend({
  type: z.literal(SecretRotation.ConvexAccessKey),
  parameters: ConvexAccessKeyRotationParametersSchema,
  secretsMapping: ConvexAccessKeyRotationSecretsMappingSchema
});

export const CreateConvexAccessKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.ConvexAccessKey
).extend({
  parameters: ConvexAccessKeyRotationParametersSchema,
  secretsMapping: ConvexAccessKeyRotationSecretsMappingSchema
});

export const UpdateConvexAccessKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.ConvexAccessKey
).extend({
  parameters: ConvexAccessKeyRotationParametersSchema.optional(),
  secretsMapping: ConvexAccessKeyRotationSecretsMappingSchema.optional()
});

export const ConvexAccessKeyRotationListItemSchema = z.object({
  name: z.literal("Convex Access Key"),
  connection: z.literal(AppConnection.Convex),
  type: z.literal(SecretRotation.ConvexAccessKey),
  template: ConvexAccessKeyRotationTemplateSchema
});
