import { z } from "zod";

const entitlementFeatureSchema = z.object({
  value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
  source: z.string().optional(),
  from_product: z.string().optional(),
  expires_at: z.string().nullish()
});

// Only the `features` map is load-bearing for the client; passthrough tolerates the rest of the
// payload so cloud/self-hosted version skew doesn't break reads.
export const entitlementsResponseSchema = z
  .object({
    features: z.record(z.string(), entitlementFeatureSchema)
  })
  .passthrough();

export type TEntitlementFeature = z.infer<typeof entitlementFeatureSchema>;
export type TEntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;

export type TLicenseClientBackend = {
  fetchEntitlements: (orgId: string) => Promise<TEntitlementsResponse>;
};
