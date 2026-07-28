import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { isValidIpOrCidr } from "@app/lib/ip";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export enum CloudflareApiTokenPolicyEffect {
  Allow = "allow",
  Deny = "deny"
}

export enum CloudflareApiTokenPolicyScope {
  Account = "account",
  Zones = "zones"
}

/**
 * Cloudflare caps token names at 120 characters. We generate names as `<name>-<timestamp>`, so the
 * user-supplied portion is capped lower to leave room for the suffix.
 */
export const CLOUDFLARE_API_TOKEN_NAME_MAX_LENGTH = 100;

const IpRestrictionSchema = z.string().trim().refine(isValidIpOrCidr, "Must be a valid IP address or CIDR block");

export const CloudflareApiTokenPolicySchema = z
  .object({
    effect: z.nativeEnum(CloudflareApiTokenPolicyEffect),
    scope: z.nativeEnum(CloudflareApiTokenPolicyScope),
    zoneIds: z.string().trim().array().optional(),
    permissionGroupIds: z.string().trim().array().min(1, "At least one permission group is required")
  })
  .superRefine((policy, ctx) => {
    if (policy.scope === CloudflareApiTokenPolicyScope.Zones && !policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "At least one zone is required when the policy is scoped to zones"
      });
    }

    if (policy.scope === CloudflareApiTokenPolicyScope.Account && policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "Zones cannot be specified when the policy is scoped to the entire account"
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
  name: z
    .string()
    .trim()
    .min(1, "Token name required")
    .max(
      CLOUDFLARE_API_TOKEN_NAME_MAX_LENGTH,
      `Token name must be ${CLOUDFLARE_API_TOKEN_NAME_MAX_LENGTH} characters or fewer`
    )
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.name),
  policies: CloudflareApiTokenPolicySchema.array()
    .min(1, "At least one access policy is required")
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.policies),
  allowedIps: IpRestrictionSchema.array()
    .optional()
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_API_TOKEN.allowedIps),
  disallowedIps: IpRestrictionSchema.array()
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
