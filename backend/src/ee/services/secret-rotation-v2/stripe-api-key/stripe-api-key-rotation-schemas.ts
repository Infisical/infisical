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

import { STRIPE_API_KEY_PERMISSIONS } from "./stripe-api-key-rotation-constants";

export const StripeApiKeyPermissionSchema = z.enum(STRIPE_API_KEY_PERMISSIONS);

export const StripeApiKeyRotationGeneratedCredentialsSchema = z
  .object({
    keyId: z.string(),
    apiKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const StripeApiKeyPermissionListSchema = StripeApiKeyPermissionSchema.array()
  .max(STRIPE_API_KEY_PERMISSIONS.length)
  .transform((permissions) => [...new Set(permissions)]);

const StripeApiKeyRotationParametersSchema = z
  .object({
    permissions: StripeApiKeyPermissionListSchema.optional().describe(
      SecretRotations.PARAMETERS.STRIPE_API_KEY.permissions
    ),
    connectPermissions: StripeApiKeyPermissionListSchema.optional().describe(
      SecretRotations.PARAMETERS.STRIPE_API_KEY.connectPermissions
    )
  })
  .superRefine((parameters, ctx) => {
    if (parameters.permissions?.length || parameters.connectPermissions?.length) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["permissions"],
      message: "At least one permission or Connect permission is required"
    });
  });

const StripeApiKeyRotationSecretsMappingSchema = z.object({
  apiKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.STRIPE_API_KEY.apiKey)
});

export const StripeApiKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiKey: z.string()
  }),
  permissions: z.string().array()
});

export const StripeApiKeyRotationSchema = BaseSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  type: z.literal(SecretRotation.StripeApiKey),
  parameters: StripeApiKeyRotationParametersSchema,
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema
});

export const CreateStripeApiKeyRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  parameters: StripeApiKeyRotationParametersSchema,
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema
});

export const UpdateStripeApiKeyRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.StripeApiKey).extend({
  parameters: StripeApiKeyRotationParametersSchema.optional(),
  secretsMapping: StripeApiKeyRotationSecretsMappingSchema.optional()
});

export const StripeApiKeyRotationListItemSchema = z.object({
  name: z.literal("Stripe API Key"),
  connection: z.literal(AppConnection.Stripe),
  type: z.literal(SecretRotation.StripeApiKey),
  template: StripeApiKeyRotationTemplateSchema
});
