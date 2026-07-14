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

export const SnowflakeUserKeyPairRotationGeneratedCredentialsSchema = z
  .object({
    privateKey: z.string(),
    publicKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const SnowflakeUserKeyPairRotationParametersSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "User Required")
    .describe(SecretRotations.PARAMETERS.SNOWFLAKE_USER_KEY_PAIR.username)
});

const SnowflakeUserKeyPairRotationSecretsMappingSchema = z.object({
  privateKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SNOWFLAKE_USER_KEY_PAIR.privateKey),
  publicKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SNOWFLAKE_USER_KEY_PAIR.publicKey)
});

export const SnowflakeUserKeyPairRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    privateKey: z.string(),
    publicKey: z.string()
  })
});

export const SnowflakeUserKeyPairRotationSchema = BaseSecretRotationSchema(SecretRotation.SnowflakeUserKeyPair).extend({
  type: z.literal(SecretRotation.SnowflakeUserKeyPair),
  parameters: SnowflakeUserKeyPairRotationParametersSchema,
  secretsMapping: SnowflakeUserKeyPairRotationSecretsMappingSchema
});

export const CreateSnowflakeUserKeyPairRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.SnowflakeUserKeyPair
).extend({
  parameters: SnowflakeUserKeyPairRotationParametersSchema,
  secretsMapping: SnowflakeUserKeyPairRotationSecretsMappingSchema
});

export const UpdateSnowflakeUserKeyPairRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.SnowflakeUserKeyPair
).extend({
  parameters: SnowflakeUserKeyPairRotationParametersSchema.optional(),
  secretsMapping: SnowflakeUserKeyPairRotationSecretsMappingSchema.optional()
});

export const SnowflakeUserKeyPairRotationListItemSchema = z.object({
  name: z.literal("Snowflake User Key Pair"),
  connection: z.literal(AppConnection.Snowflake),
  type: z.literal(SecretRotation.SnowflakeUserKeyPair),
  template: SnowflakeUserKeyPairRotationTemplateSchema
});
