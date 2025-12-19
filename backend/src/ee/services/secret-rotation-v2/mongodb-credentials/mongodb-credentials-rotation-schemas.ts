import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  SqlCredentialsRotationGeneratedCredentialsSchema,
  SqlCredentialsRotationParametersSchema,
  SqlCredentialsRotationTemplateSchema
} from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const MongoDBCredentialsRotationGeneratedCredentialsSchema = SqlCredentialsRotationGeneratedCredentialsSchema;
export const MongoDBCredentialsRotationParametersSchema = SqlCredentialsRotationParametersSchema.omit({
  rotationStatement: true
});
export const MongoDBCredentialsRotationTemplateSchema = SqlCredentialsRotationTemplateSchema.omit({
  rotationStatement: true
});

const MongoDBCredentialsRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.MONGODB_CREDENTIALS.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.MONGODB_CREDENTIALS.password)
});

export const MongoDBCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.MongoDBCredentials).extend({
  type: z.literal(SecretRotation.MongoDBCredentials),
  parameters: MongoDBCredentialsRotationParametersSchema,
  secretsMapping: MongoDBCredentialsRotationSecretsMappingSchema
});

export const CreateMongoDBCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.MongoDBCredentials
).extend({
  parameters: MongoDBCredentialsRotationParametersSchema,
  secretsMapping: MongoDBCredentialsRotationSecretsMappingSchema
});

export const UpdateMongoDBCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.MongoDBCredentials
).extend({
  parameters: MongoDBCredentialsRotationParametersSchema.optional(),
  secretsMapping: MongoDBCredentialsRotationSecretsMappingSchema.optional()
});

export const MongoDBCredentialsRotationListItemSchema = z.object({
  name: z.literal("MongoDB Credentials"),
  connection: z.literal(AppConnection.MongoDB),
  type: z.literal(SecretRotation.MongoDBCredentials),
  template: MongoDBCredentialsRotationTemplateSchema
});
