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

export const MySqlCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.MySqlCredentials).extend({
  type: z.literal(SecretRotation.MySqlCredentials),
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const CreateMySqlCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.MySqlCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const UpdateMySqlCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.MySqlCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema.optional(),
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema.optional()
});

export const MySqlCredentialsRotationListItemSchema = z.object({
  name: z.literal("MySQL Credentials"),
  connection: z.literal(AppConnection.MySql),
  type: z.literal(SecretRotation.MySqlCredentials),
  template: SqlCredentialsRotationTemplateSchema
});
