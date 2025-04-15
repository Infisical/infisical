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

export const Auth0ClientSecretRotationGeneratedCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string()
  })
  .array()
  .min(1)
  .max(2);

const Auth0ClientSecretRotationParametersSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID Required")
    .describe(SecretRotations.PARAMETERS.AUTH0_CLIENT_SECRET.clientId)
});

const Auth0ClientSecretRotationSecretsMappingSchema = z.object({
  clientId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AUTH0_CLIENT_SECRET.clientId),
  clientSecret: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AUTH0_CLIENT_SECRET.clientSecret)
});

export const Auth0ClientSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    clientId: z.string(),
    clientSecret: z.string()
  })
});

export const Auth0ClientSecretRotationSchema = BaseSecretRotationSchema(SecretRotation.Auth0ClientSecret).extend({
  type: z.literal(SecretRotation.Auth0ClientSecret),
  parameters: Auth0ClientSecretRotationParametersSchema,
  secretsMapping: Auth0ClientSecretRotationSecretsMappingSchema
});

export const CreateAuth0ClientSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.Auth0ClientSecret
).extend({
  parameters: Auth0ClientSecretRotationParametersSchema,
  secretsMapping: Auth0ClientSecretRotationSecretsMappingSchema
});

export const UpdateAuth0ClientSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.Auth0ClientSecret
).extend({
  parameters: Auth0ClientSecretRotationParametersSchema.optional(),
  secretsMapping: Auth0ClientSecretRotationSecretsMappingSchema.optional()
});

export const Auth0ClientSecretRotationListItemSchema = z.object({
  name: z.literal("Auth0 Client Secret"),
  connection: z.literal(AppConnection.Auth0),
  type: z.literal(SecretRotation.Auth0ClientSecret),
  template: Auth0ClientSecretRotationTemplateSchema
});
