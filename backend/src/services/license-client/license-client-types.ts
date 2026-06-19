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

const catalogDimensionSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    noun: z.string()
  })
  .passthrough();

// Pricing lives on the plan: one row per dimension per cadence ("monthly"/"annual").
const catalogPlanPriceSchema = z
  .object({
    dimensionKey: z.string(),
    cadence: z.string(),
    unitAmountCents: z.number(),
    includedQuantity: z.number().nullish()
  })
  .passthrough();

const catalogPlanSchema = z
  .object({
    tier: z.string(),
    name: z.string(),
    selfServe: z.boolean(),
    salesLed: z.boolean(),
    feature: z.string().optional(),
    basePriceMonthlyCents: z.number().nullish(),
    basePriceAnnualCents: z.number().nullish(),
    prices: z.array(catalogPlanPriceSchema).default([])
  })
  .passthrough();

const catalogComparisonCellSchema = z
  .object({
    tier: z.string(),
    value: z.union([z.string(), z.boolean()])
  })
  .passthrough();

const catalogComparisonSchema = z
  .object({
    label: z.string(),
    cells: z.array(catalogComparisonCellSchema).default([])
  })
  .passthrough();

const catalogProductSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    tagline: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    model: z.string(),
    addon: z.boolean(),
    dimensions: z.array(catalogDimensionSchema),
    plans: z.array(catalogPlanSchema),
    comparison: z.array(catalogComparisonSchema),
    includes: z.array(z.string())
  })
  .passthrough();

export const catalogResponseSchema = z
  .object({
    products: z.array(catalogProductSchema)
  })
  .passthrough();

const subscriptionItemSchema = z
  .object({
    productId: z.string(),
    plan: z.string(),
    quantities: z.record(z.string(), z.number()),
    limits: z.record(z.string(), z.number()),
    amount: z.number().optional()
  })
  .passthrough();

export const subscriptionResponseSchema = z
  .object({
    status: z.string(),
    cadence: z.string(),
    currentPeriodEnd: z.number().nullable(),
    recurringTotal: z.number().nullable(),
    items: z.array(subscriptionItemSchema)
  })
  .passthrough();

export const sessionResponseSchema = z
  .object({
    url: z.string().url()
  })
  .passthrough();

// The cloud-plan FeatureSet carries plan caps; the server nulls a limit when it is effectively
// unlimited. Used counts come back zeroed and are overlaid by this app, so we ignore them.
export const cloudPlanResponseSchema = z
  .object({
    currentPlan: z
      .object({
        memberLimit: z.number().nullish(),
        identityLimit: z.number().nullish()
      })
      .passthrough()
  })
  .passthrough();

export type TEntitlementFeature = z.infer<typeof entitlementFeatureSchema>;
export type TEntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;
export type TCatalogProduct = z.infer<typeof catalogProductSchema>;
export type TCatalogResponse = z.infer<typeof catalogResponseSchema>;
export type TSubscriptionItem = z.infer<typeof subscriptionItemSchema>;
export type TSubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
export type TSessionResponse = z.infer<typeof sessionResponseSchema>;
export type TCloudPlanResponse = z.infer<typeof cloudPlanResponseSchema>;

export type TCheckoutLineItem = {
  productId: string;
  plan: string;
  cadence: string;
  quantities: Record<string, number>;
};

export type TCreateCheckoutPayload = {
  items: TCheckoutLineItem[];
  email?: string;
  returnPath?: string;
};

export type TCreatePortalPayload = {
  returnPath?: string;
};

export type TLicenseClientBackend = {
  fetchEntitlements: (orgId: string) => Promise<TEntitlementsResponse>;
  fetchCatalog: () => Promise<TCatalogResponse>;
  fetchSubscription: (orgId: string) => Promise<TSubscriptionResponse | null>;
  fetchCloudPlan: (orgId: string) => Promise<TCloudPlanResponse | null>;
  createCheckoutSession: (orgId: string, payload: TCreateCheckoutPayload) => Promise<TSessionResponse>;
  createPortalSession: (orgId: string, payload: TCreatePortalPayload) => Promise<TSessionResponse>;
};
