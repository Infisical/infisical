import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  SqlCredentialsRotationGeneratedCredentialsSchema,
  SqlCredentialsRotationTemplateSchema
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const ClickHouseCredentialsRotationGeneratedCredentialsSchema = SqlCredentialsRotationGeneratedCredentialsSchema;
export const ClickHouseCredentialsRotationParametersSchema = z.object({
  username1: z
    .string()
    .trim()
    .min(1, "Username1 Required")
    .max(256, "Username1 cannot exceed 256 characters")
    .describe(SecretRotations.PARAMETERS.SQL_CREDENTIALS.username1),
  username2: z
    .string()
    .trim()
    .min(1, "Username2 Required")
    .max(256, "Username2 cannot exceed 256 characters")
    .describe(SecretRotations.PARAMETERS.SQL_CREDENTIALS.username2)
});
export const ClickHouseCredentialsRotationTemplateSchema = SqlCredentialsRotationTemplateSchema.omit({
  rotationStatement: true
});

const ClickHouseCredentialsRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLICKHOUSE_CREDENTIALS.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLICKHOUSE_CREDENTIALS.password)
});

export const ClickHouseCredentialsRotationSchema = BaseSecretRotationSchema(
  SecretRotation.ClickHouseCredentials
).extend({
  type: z.literal(SecretRotation.ClickHouseCredentials),
  parameters: ClickHouseCredentialsRotationParametersSchema,
  secretsMapping: ClickHouseCredentialsRotationSecretsMappingSchema
});

export const CreateClickHouseCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.ClickHouseCredentials
).extend({
  parameters: ClickHouseCredentialsRotationParametersSchema,
  secretsMapping: ClickHouseCredentialsRotationSecretsMappingSchema
});

export const UpdateClickHouseCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.ClickHouseCredentials
).extend({
  parameters: ClickHouseCredentialsRotationParametersSchema.optional(),
  secretsMapping: ClickHouseCredentialsRotationSecretsMappingSchema.optional()
});

export const ClickHouseCredentialsRotationListItemSchema = z.object({
  name: z.literal("ClickHouse Credentials"),
  connection: z.literal(AppConnection.ClickHouse),
  type: z.literal(SecretRotation.ClickHouseCredentials),
  template: ClickHouseCredentialsRotationTemplateSchema
});
