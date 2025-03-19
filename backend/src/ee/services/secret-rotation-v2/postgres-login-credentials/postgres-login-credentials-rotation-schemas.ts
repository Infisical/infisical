import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

const PostgresLoginCredentialsRotationParametersSchema = z.object({
  usernameSecretKey: z
    .string()
    .trim()
    .min(1, "Username Secret Key Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_LOGIN_CREDENTIALS.usernameSecretKey),
  passwordSecretKey: z
    .string()
    .trim()
    .min(1, "Username Secret Key Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_LOGIN_CREDENTIALS.passwordSecretKey),
  issueStatement: z
    .string()
    .trim()
    .min(1, "Issue Login Credentials SQL Statement Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_LOGIN_CREDENTIALS.issueStatement),
  revokeStatement: z
    .string()
    .trim()
    .min(1, "Revoke Login Credentials SQL Statement Required")
    .describe(SecretRotations.PARAMETERS.POSTGRES_LOGIN_CREDENTIALS.revokeStatement)
});

const PostgresLoginCredentialsRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

export const PostgresLoginCredentialsRotationSchema = BaseSecretRotationSchema(
  SecretRotation.PostgresLoginCredentials
).extend({
  type: z.literal(SecretRotation.PostgresLoginCredentials),
  parameters: PostgresLoginCredentialsRotationParametersSchema
  // generatedCredentials: PostgresLoginCredentialsRotationGeneratedCredentialsSchema
});

export const CreatePostgresLoginCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.PostgresLoginCredentials
).extend({
  parameters: PostgresLoginCredentialsRotationParametersSchema
});

export const UpdatePostgresLoginCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.PostgresLoginCredentials
).extend({
  parameters: PostgresLoginCredentialsRotationParametersSchema.optional()
});

export const PostgresLoginCredentialsRotationListItemSchema = z.object({
  name: z.literal("PostgreSQL Login Credentials"),
  connection: z.literal(AppConnection.Postgres),
  type: z.literal(SecretRotation.PostgresLoginCredentials)
});
