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

import { PasswordRequirementsSchema } from "../shared/general";

export const RedisCredentialsRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const RedisCredentialsRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.REDIS_CREDENTIALS.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.REDIS_CREDENTIALS.password)
});

export const RedisCredentialsRotationParametersSchema = z.object({
  passwordRequirements: PasswordRequirementsSchema.optional(),
  permissionScope: z
    .string()
    .trim()
    .min(1, "Permission scope is required")
    .describe(SecretRotations.PARAMETERS.REDIS_CREDENTIALS.permissionScope)
});

export const RedisCredentialsRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});

export const RedisCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.RedisCredentials).extend({
  type: z.literal(SecretRotation.RedisCredentials),
  parameters: RedisCredentialsRotationParametersSchema,
  secretsMapping: RedisCredentialsRotationSecretsMappingSchema
});

export const CreateRedisCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.RedisCredentials
).extend({
  parameters: RedisCredentialsRotationParametersSchema,
  secretsMapping: RedisCredentialsRotationSecretsMappingSchema
});

export const UpdateRedisCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.RedisCredentials
).extend({
  parameters: RedisCredentialsRotationParametersSchema.optional(),
  secretsMapping: RedisCredentialsRotationSecretsMappingSchema.optional()
});

export const RedisCredentialsRotationListItemSchema = z.object({
  name: z.literal("Redis Credentials"),
  connection: z.literal(AppConnection.Redis),
  type: z.literal(SecretRotation.RedisCredentials),
  template: RedisCredentialsRotationTemplateSchema
});
