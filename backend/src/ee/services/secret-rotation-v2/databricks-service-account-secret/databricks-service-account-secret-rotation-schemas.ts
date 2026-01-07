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

export const DatabricksServiceAccountSecretRotationGeneratedCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string(),
    secretId: z.string()
  })
  .array()
  .min(1)
  .max(2);

const DatabricksServiceAccountSecretRotationParametersSchema = z.object({
  servicePrincipalId: z
    .string()
    .trim()
    .min(1, "Service Principal ID Required")
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_ACCOUNT_SECRET.servicePrincipalId),
  servicePrincipalName: z
    .string()
    .trim()
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_ACCOUNT_SECRET.servicePrincipalName)
    .optional(),
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID Required")
    .describe(SecretRotations.PARAMETERS.DATABRICKS_SERVICE_ACCOUNT_SECRET.clientId)
});

const DatabricksServiceAccountSecretRotationSecretsMappingSchema = z.object({
  clientId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.DATABRICKS_SERVICE_ACCOUNT_SECRET.clientId),
  clientSecret: SecretNameSchema.describe(
    SecretRotations.SECRETS_MAPPING.DATABRICKS_SERVICE_ACCOUNT_SECRET.clientSecret
  )
});

export const DatabricksServiceAccountSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    clientId: z.string(),
    clientSecret: z.string()
  })
});

export const DatabricksServiceAccountSecretRotationSchema = BaseSecretRotationSchema(
  SecretRotation.DatabricksServiceAccountSecret
).extend({
  type: z.literal(SecretRotation.DatabricksServiceAccountSecret),
  parameters: DatabricksServiceAccountSecretRotationParametersSchema,
  secretsMapping: DatabricksServiceAccountSecretRotationSecretsMappingSchema
});

export const CreateDatabricksServiceAccountSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.DatabricksServiceAccountSecret
).extend({
  parameters: DatabricksServiceAccountSecretRotationParametersSchema,
  secretsMapping: DatabricksServiceAccountSecretRotationSecretsMappingSchema
});

export const UpdateDatabricksServiceAccountSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.DatabricksServiceAccountSecret
).extend({
  parameters: DatabricksServiceAccountSecretRotationParametersSchema.optional(),
  secretsMapping: DatabricksServiceAccountSecretRotationSecretsMappingSchema.optional()
});

export const DatabricksServiceAccountSecretRotationListItemSchema = z.object({
  name: z.literal("Databricks Service Account Secret"),
  connection: z.literal(AppConnection.Databricks),
  type: z.literal(SecretRotation.DatabricksServiceAccountSecret),
  template: DatabricksServiceAccountSecretRotationTemplateSchema
});
