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

export const OktaClientSecretRotationGeneratedCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string(),
    secretId: z.string()
  })
  .array()
  .min(1)
  .max(2);

const OktaClientSecretRotationParametersSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Client ID Required")
    .describe(SecretRotations.PARAMETERS.OKTA_CLIENT_SECRET.clientId)
});

const OktaClientSecretRotationSecretsMappingSchema = z.object({
  clientId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.OKTA_CLIENT_SECRET.clientId),
  clientSecret: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.OKTA_CLIENT_SECRET.clientSecret)
});

export const OktaClientSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    clientId: z.string(),
    clientSecret: z.string()
  })
});

export const OktaClientSecretRotationSchema = BaseSecretRotationSchema(SecretRotation.OktaClientSecret).extend({
  type: z.literal(SecretRotation.OktaClientSecret),
  parameters: OktaClientSecretRotationParametersSchema,
  secretsMapping: OktaClientSecretRotationSecretsMappingSchema
});

export const CreateOktaClientSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.OktaClientSecret
).extend({
  parameters: OktaClientSecretRotationParametersSchema,
  secretsMapping: OktaClientSecretRotationSecretsMappingSchema
});

export const UpdateOktaClientSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.OktaClientSecret
).extend({
  parameters: OktaClientSecretRotationParametersSchema.optional(),
  secretsMapping: OktaClientSecretRotationSecretsMappingSchema.optional()
});

export const OktaClientSecretRotationListItemSchema = z.object({
  name: z.literal("Okta Client Secret"),
  connection: z.literal(AppConnection.Okta),
  type: z.literal(SecretRotation.OktaClientSecret),
  template: OktaClientSecretRotationTemplateSchema
});
