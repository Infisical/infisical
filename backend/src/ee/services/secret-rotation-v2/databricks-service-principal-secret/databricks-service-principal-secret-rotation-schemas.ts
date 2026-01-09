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

export const DatabricksServicePrincipalSecretRotationGeneratedCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string(),
    secretId: z.string()
  })
  .array()
  .min(1)
  .max(2);

const DatabricksServicePrincipalSecretRotationParametersSchema = z.object({
  servicePrincipalId: z
    .string()
    .trim()
    .min(1, "Service Principal ID Required")
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_PRINCIPAL_SECRET.servicePrincipalId),
  servicePrincipalName: z
    .string()
    .trim()
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_PRINCIPAL_SECRET.servicePrincipalName)
    .optional(),
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID Required")
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_PRINCIPAL_SECRET.clientId)
});

const DatabricksServicePrincipalSecretRotationSecretsMappingSchema = z.object({
  clientId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.DATABRICKS_SERVICE_PRINCIPAL_SECRET.clientId),
  clientSecret: SecretNameSchema.describe(
    SecretRotations.SECRETS_MAPPING.DATABRICKS_SERVICE_PRINCIPAL_SECRET.clientSecret
  )
});

export const DatabricksServicePrincipalSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    clientId: z.string(),
    clientSecret: z.string()
  })
});

export const DatabricksServicePrincipalSecretRotationSchema = BaseSecretRotationSchema(
  SecretRotation.DatabricksServicePrincipalSecret
).extend({
  type: z.literal(SecretRotation.DatabricksServicePrincipalSecret),
  parameters: DatabricksServicePrincipalSecretRotationParametersSchema,
  secretsMapping: DatabricksServicePrincipalSecretRotationSecretsMappingSchema
});

export const CreateDatabricksServicePrincipalSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.DatabricksServicePrincipalSecret
).extend({
  parameters: DatabricksServicePrincipalSecretRotationParametersSchema,
  secretsMapping: DatabricksServicePrincipalSecretRotationSecretsMappingSchema
});

export const UpdateDatabricksServicePrincipalSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.DatabricksServicePrincipalSecret
).extend({
  parameters: DatabricksServicePrincipalSecretRotationParametersSchema.optional(),
  secretsMapping: DatabricksServicePrincipalSecretRotationSecretsMappingSchema.optional()
});

export const DatabricksServicePrincipalSecretRotationListItemSchema = z.object({
  name: z.literal("Databricks Service Principal Secret"),
  connection: z.literal(AppConnection.Databricks),
  type: z.literal(SecretRotation.DatabricksServicePrincipalSecret),
  template: DatabricksServicePrincipalSecretRotationTemplateSchema
});
