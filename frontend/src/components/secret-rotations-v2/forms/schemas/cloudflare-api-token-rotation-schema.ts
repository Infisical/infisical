import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import {
  CloudflareTokenIpRestrictionsSchema,
  CloudflareTokenNameSchema
} from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { groupBy, unique } from "@app/lib/fn/array";

export enum CloudflareApiTokenPolicyEffect {
  Allow = "allow",
  Deny = "deny"
}

export enum CloudflareApiTokenPolicyScope {
  Account = "account",
  AllZones = "all-zones",
  Zones = "zones"
}

export const CLOUDFLARE_POLICY_EFFECT_MAP: Record<CloudflareApiTokenPolicyEffect, string> = {
  [CloudflareApiTokenPolicyEffect.Allow]: "Allow",
  [CloudflareApiTokenPolicyEffect.Deny]: "Deny"
};

export const CLOUDFLARE_POLICY_SCOPE_MAP: Record<CloudflareApiTokenPolicyScope, string> = {
  [CloudflareApiTokenPolicyScope.Account]: "Entire account",
  [CloudflareApiTokenPolicyScope.AllZones]: "All zones",
  [CloudflareApiTokenPolicyScope.Zones]: "Specific zones"
};

/** A permission group only applies to the resource types listed in its `scopes`. */
export const CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP: Record<CloudflareApiTokenPolicyScope, string> = {
  [CloudflareApiTokenPolicyScope.Account]: "com.cloudflare.api.account",
  [CloudflareApiTokenPolicyScope.AllZones]: "com.cloudflare.api.account.zone",
  [CloudflareApiTokenPolicyScope.Zones]: "com.cloudflare.api.account.zone"
};

/**
 * What a form row holds: exactly one permission group, which keeps each row readable as a single
 * sentence. Rows are merged into the API shape by `mergePolicyRows` on submit.
 */
export const CloudflareApiTokenPolicyRowSchema = z
  .object({
    effect: z.nativeEnum(CloudflareApiTokenPolicyEffect),
    scope: z.nativeEnum(CloudflareApiTokenPolicyScope),
    zoneIds: z.string().trim().array().optional(),
    permissionGroupId: z.string().trim().min(1, "Permission group required")
  })
  .superRefine((policy, ctx) => {
    if (policy.scope === CloudflareApiTokenPolicyScope.Zones && !policy.zoneIds?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zoneIds"],
        message: "At least one zone is required"
      });
    }
  });

export type TCloudflareApiTokenPolicyRow = z.infer<typeof CloudflareApiTokenPolicyRowSchema>;

/** What the API stores: one policy per (effect, scope, zones) with all its permission groups. */
export type TCloudflareApiTokenPolicyStored = Omit<
  TCloudflareApiTokenPolicyRow,
  "permissionGroupId"
> & {
  permissionGroupIds: string[];
};

const policyResourceKey = ({ effect, scope, zoneIds }: TCloudflareApiTokenPolicyRow) =>
  `${effect}|${scope}|${[...(zoneIds ?? [])].sort().join(",")}`;

/**
 * Collapses form rows into the stored shape, gathering the permission groups of every row that targets
 * the same resources. Zone ids are sorted in the grouping key only, so rows that name the same zones
 * in a different order still merge; the stored order is left as the user entered it.
 */
export const mergePolicyRows = (
  rows: TCloudflareApiTokenPolicyRow[]
): TCloudflareApiTokenPolicyStored[] =>
  Object.values(groupBy(rows, policyResourceKey)).map((group) => ({
    effect: group[0].effect,
    scope: group[0].scope,
    zoneIds: group[0].zoneIds,
    permissionGroupIds: unique(group.map((row) => row.permissionGroupId))
  }));

/** Inverse of `mergePolicyRows` — expands a stored policy into one row per permission group. */
export const explodePolicies = (
  policies: TCloudflareApiTokenPolicyStored[]
): TCloudflareApiTokenPolicyRow[] =>
  policies.flatMap(({ effect, scope, zoneIds, permissionGroupIds }) =>
    permissionGroupIds.map((permissionGroupId) => ({ effect, scope, zoneIds, permissionGroupId }))
  );

export const isStoredPolicy = (policy: unknown): policy is TCloudflareApiTokenPolicyStored =>
  typeof policy === "object" && policy !== null && "permissionGroupIds" in policy;

export const CloudflareApiTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.CloudflareApiToken),
    parameters: z.object({
      name: CloudflareTokenNameSchema,
      // The form edits rows; zodResolver hands the transformed (merged) value to handleSubmit, so the
      // API receives the stored shape without the generic rotation form knowing anything about it.
      policies: CloudflareApiTokenPolicyRowSchema.array()
        .min(1, "At least one policy is required")
        .transform(mergePolicyRows),
      allowedIps: CloudflareTokenIpRestrictionsSchema,
      disallowedIps: CloudflareTokenIpRestrictionsSchema
    }),
    secretsMapping: z.object({
      tokenId: z.string().trim().min(1, "Token ID secret name required"),
      apiToken: z.string().trim().min(1, "API Token secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
