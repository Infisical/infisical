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

export const OracleDBCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.OracleDBCredentials).extend({
  type: z.literal(SecretRotation.OracleDBCredentials),
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const CreateOracleDBCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.OracleDBCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const UpdateOracleDBCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.OracleDBCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema.optional(),
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema.optional()
});

export const OracleDBCredentialsRotationListItemSchema = z.object({
  name: z.literal("OracleDB Credentials"),
  connection: z.literal(AppConnection.OracleDB),
  type: z.literal(SecretRotation.OracleDBCredentials),
  template: SqlCredentialsRotationTemplateSchema
});
