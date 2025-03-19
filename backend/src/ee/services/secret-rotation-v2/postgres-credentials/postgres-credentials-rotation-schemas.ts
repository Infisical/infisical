import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

const PostgresCredentialsRotationParametersSchema = z.object({
  usernameSecretKey: z
    .string()
    .trim()
    .min(1, "Username Secret Key Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_CREDENTIALS.usernameSecretKey),
  passwordSecretKey: z
    .string()
    .trim()
    .min(1, "Username Secret Key Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_CREDENTIALS.passwordSecretKey),
  issueStatement: z
    .string()
    .trim()
    .min(1, "Issue Credentials SQL Statement Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_CREDENTIALS.issueStatement),
  revokeStatement: z
    .string()
    .trim()
    .min(1, "Revoke Credentials SQL Statement Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_CREDENTIALS.revokeStatement)
});

const PostgresCredentialsRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

export const PostgresCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.PostgresCredentials).extend({
  type: z.literal(SecretRotation.PostgresCredentials),
  parameters: PostgresCredentialsRotationParametersSchema
  // generatedCredentials: PostgresCredentialsRotationGeneratedCredentialsSchema
});

export const CreatePostgresCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.PostgresCredentials
).extend({
  parameters: PostgresCredentialsRotationParametersSchema
});

export const UpdatePostgresCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.PostgresCredentials
).extend({
  parameters: PostgresCredentialsRotationParametersSchema.optional()
});

export const PostgresCredentialsRotationListItemSchema = z.object({
  name: z.literal("PostgreSQL  Credentials"),
  connection: z.literal(AppConnection.Postgres),
  type: z.literal(SecretRotation.PostgresCredentials)
});
