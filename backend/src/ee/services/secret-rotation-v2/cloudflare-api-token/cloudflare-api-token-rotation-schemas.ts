import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  CloudflareTokenIpRestrictionSchema,
  CloudflareTokenNameSchema,
  CloudflareTokenPolicyEffect
} from "@app/ee/services/secret-rotation-v2/shared/cloudflare-token";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export enum CloudflareApiTokenPolicyScope {
  Account = "account",
  AllZones = "all-zones",
  Zones = "zones"
}

export const CloudflareApiTokenPolicySchema = z
  .object({
    effect: z.nativeEnum(CloudflareTokenPolicyEffect),
    scope: z.nativeEnum(CloudflareApiTokenPolicyScope),
    zoneIds: z.string().trim().array().optional(),
    permissionGroupIds: z.string().trim().array().min(1, "At least one permission group is required")
  })
  .superRefine((policy, ctx) => {
    if (policy.scope === CloudflareApiTokenPolicyScope.Zones && !policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "At least one zone is required when the policy is scoped to specific zones"
      });
    }

    // reject zones on the other scopes rather than silently ignoring them
    if (policy.scope !== CloudflareApiTokenPolicyScope.Zones && policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "Zones can only be specified when the policy is scoped to specific zones"
      });
    }
  });

export const CloudflareApiTokenRotationGeneratedCredentialsSchema = z
  .object({
    tokenId: z.string(),
    apiToken: z.string()
  })
  .array()
  .min(1)
  .max(2);

const CloudflareApiTokenRotationParametersSchema = z.object({
  name: CloudflareTokenNameSchema.describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.name),
  policies: CloudflareApiTokenPolicySchema.array()
    .min(1, "At least one access policy is required")
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.policies),
  allowedIps: CloudflareTokenIpRestrictionSchema.array()
    .optional()
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.allowedIps),
  disallowedIps: CloudflareTokenIpRestrictionSchema.array()
    .optional()
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.disallowedIps)
});

const CloudflareApiTokenRotationSecretsMappingSchema = z.object({
  tokenId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLOUDFLARE_API_TOKEN.tokenId),
  apiToken: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLOUDFLARE_API_TOKEN.apiToken)
});

export const CloudflareApiTokenRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    tokenId: z.string(),
    apiToken: z.string()
  })
});

export const CloudflareApiTokenRotationSchema = BaseSecretRotationSchema(SecretRotation.CloudflareApiToken).extend({
  type: z.literal(SecretRotation.CloudflareApiToken),
  parameters: CloudflareApiTokenRotationParametersSchema,
  secretsMapping: CloudflareApiTokenRotationSecretsMappingSchema
});

export const CreateCloudflareApiTokenRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.CloudflareApiToken
).extend({
  parameters: CloudflareApiTokenRotationParametersSchema,
  secretsMapping: CloudflareApiTokenRotationSecretsMappingSchema
});

export const UpdateCloudflareApiTokenRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.CloudflareApiToken
).extend({
  parameters: CloudflareApiTokenRotationParametersSchema.optional(),
  secretsMapping: CloudflareApiTokenRotationSecretsMappingSchema.optional()
});

export const CloudflareApiTokenRotationListItemSchema = z.object({
  name: z.literal("Cloudflare API Token"),
  connection: z.literal(AppConnection.Cloudflare),
  type: z.literal(SecretRotation.CloudflareApiToken),
  template: CloudflareApiTokenRotationTemplateSchema
});
