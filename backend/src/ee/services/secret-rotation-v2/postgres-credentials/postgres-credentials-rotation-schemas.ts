import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  SqlCredentialsRotationParametersSchema,
  SqlCredentialsRotationSecretsMappingSchema,
  SqlCredentialsRotationTemplateSchema
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const PostgresCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.PostgresCredentials).extend({
  type: z.literal(SecretRotation.PostgresCredentials),
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const CreatePostgresCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.PostgresCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const UpdatePostgresCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.PostgresCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema.optional(),
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema.optional()
});

export const PostgresCredentialsRotationListItemSchema = z.object({
  name: z.literal("PostgreSQL Credentials"),
  connection: z.literal(AppConnection.Postgres),
  type: z.literal(SecretRotation.PostgresCredentials),
  template: SqlCredentialsRotationTemplateSchema
});
