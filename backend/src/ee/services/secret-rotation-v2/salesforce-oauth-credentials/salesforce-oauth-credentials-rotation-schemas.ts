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

export const SalesforceOauthCredentialsRotationGeneratedCredentialsSchema = z
  .object({
    consumerKey: z.string(),
    consumerSecret: z.string(),
    stagedCredentialUrl: z.string()
  })
  .array()
  .min(1)
  .max(2);

const SalesforceOauthCredentialsRotationParametersSchema = z.object({
  appId: z
    .string()
    .trim()
    .min(1, "App Identifier Required")
    .describe(SecretRotations.PARAMETERS.SALESFORCE_OAUTH_CREDENTIALS.appId),
  appName: z
    .string()
    .trim()
    .min(1, "App Name Required")
    .describe(SecretRotations.PARAMETERS.SALESFORCE_OAUTH_CREDENTIALS.appName)
});

const SalesforceOauthCredentialsRotationSecretsMappingSchema = z.object({
  consumerKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SALESFORCE_OAUTH_CREDENTIALS.consumerKey),
  consumerSecret: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SALESFORCE_OAUTH_CREDENTIALS.consumerSecret)
});

export const SalesforceOauthCredentialsRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    consumerKey: z.string(),
    consumerSecret: z.string()
  })
});

export const SalesforceOauthCredentialsRotationSchema = BaseSecretRotationSchema(
  SecretRotation.SalesforceOauthCredentials
).extend({
  type: z.literal(SecretRotation.SalesforceOauthCredentials),
  parameters: SalesforceOauthCredentialsRotationParametersSchema,
  secretsMapping: SalesforceOauthCredentialsRotationSecretsMappingSchema
});

export const CreateSalesforceOauthCredentialsRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.SalesforceOauthCredentials
).extend({
  parameters: SalesforceOauthCredentialsRotationParametersSchema,
  secretsMapping: SalesforceOauthCredentialsRotationSecretsMappingSchema
});

export const UpdateSalesforceOauthCredentialsRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.SalesforceOauthCredentials
).extend({
  parameters: SalesforceOauthCredentialsRotationParametersSchema.optional(),
  secretsMapping: SalesforceOauthCredentialsRotationSecretsMappingSchema.optional()
});

export const SalesforceOauthCredentialsRotationListItemSchema = z.object({
  name: z.literal("Salesforce OAuth Credentials"),
  connection: z.literal(AppConnection.Salesforce),
  type: z.literal(SecretRotation.SalesforceOauthCredentials),
  template: SalesforceOauthCredentialsRotationTemplateSchema
});
