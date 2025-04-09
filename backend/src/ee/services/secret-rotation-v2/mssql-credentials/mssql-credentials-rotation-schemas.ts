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

export const MsSqlCredentialsRotationSchema = BaseSecretRotationSchema(SecretRotation.MsSqlCredentials).extend({
  type: z.literal(SecretRotation.MsSqlCredentials),
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const CreateMsSqlCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.MsSqlCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema,
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema
});

export const UpdateMsSqlCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.MsSqlCredentials
).extend({
  parameters: SqlCredentialsRotationParametersSchema.optional(),
  secretsMapping: SqlCredentialsRotationSecretsMappingSchema.optional()
});

export const MsSqlCredentialsRotationListItemSchema = z.object({
  name: z.literal("Microsoft SQL Server Credentials"),
  connection: z.literal(AppConnection.MsSql),
  type: z.literal(SecretRotation.MsSqlCredentials),
  template: SqlCredentialsRotationTemplateSchema
});
