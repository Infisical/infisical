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

// Checkout either needs the customer to complete a Stripe Checkout (checkout_created) or is applied
// directly to an existing subscription (subscription_updated).
export const checkoutResultSchema = z
  .object({
    outcome: z.enum(["checkout_created", "subscription_updated"]),
    checkoutUrl: z.string().optional(),
    subscriptionId: z.string().optional()
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

// Billing profile: the org's Stripe payment method, billing identity, and recent invoices. Every
// field is null/empty when the org has no Stripe customer yet (the server returns 200, not 404).
// Invoice amounts are cents and dates are Unix seconds, matching /v1/subscription.
const billingProfilePaymentSchema = z
  .object({
    brand: z.string(),
    last4: z.string(),
    expMonth: z.number(),
    expYear: z.number()
  })
  .passthrough();

// Stripe leaves any unfilled field null (line2/state are absent for most customers) and older
// license servers may omit them, so every sub-field is nullish. A strict z.string() would throw on
// a partial address; because the whole profile is parsed in one shot, that failure silently drops
// the customer's payment method and invoices too, not just the address.
const billingProfileAddressSchema = z
  .object({
    line1: z.string().nullish(),
    line2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postalCode: z.string().nullish(),
    country: z.string().nullish()
  })
  .passthrough();

const billingProfileTaxIdSchema = z.object({ type: z.string(), value: z.string() }).passthrough();

const billingProfileDetailsSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    // Absent on older license servers that predate these fields; address is null when the customer
    // has none, taxIds defaults to [] so callers can map it without a null check.
    address: billingProfileAddressSchema.nullish(),
    taxIds: z.array(billingProfileTaxIdSchema).default([])
  })
  .passthrough();

const billingProfileInvoiceSchema = z
  .object({
    id: z.string(),
    number: z.string(),
    date: z.number().nullish(),
    amount: z.number(),
    paid: z.boolean(),
    pdfUrl: z.string().nullish()
  })
  .passthrough();

export const billingProfileResponseSchema = z
  .object({
    payment: billingProfilePaymentSchema.nullable(),
    billingDetails: billingProfileDetailsSchema.nullable(),
    invoices: z.array(billingProfileInvoiceSchema).default([])
  })
  .passthrough();

export type TEntitlementFeature = z.infer<typeof entitlementFeatureSchema>;
export type TEntitlementsResponse = z.infer<typeof entitlementsResponseSchema>;

export type TEntitlementOrg = { id: string; name?: string | null; slug?: string | null };
export type TCatalogProduct = z.infer<typeof catalogProductSchema>;
export type TCatalogResponse = z.infer<typeof catalogResponseSchema>;
export type TSubscriptionItem = z.infer<typeof subscriptionItemSchema>;
export type TSubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;
export type TSessionResponse = z.infer<typeof sessionResponseSchema>;
export type TCheckoutResult = z.infer<typeof checkoutResultSchema>;
export type TCloudPlanResponse = z.infer<typeof cloudPlanResponseSchema>;
export type TBillingProfileResponse = z.infer<typeof billingProfileResponseSchema>;

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
  fetchEntitlements: (org: TEntitlementOrg) => Promise<TEntitlementsResponse>;
  fetchCatalog: () => Promise<TCatalogResponse>;
  fetchSubscription: (orgId: string) => Promise<TSubscriptionResponse | null>;
  fetchCloudPlan: (orgId: string) => Promise<TCloudPlanResponse | null>;
  fetchBillingProfile: (orgId: string) => Promise<TBillingProfileResponse | null>;
  createCheckoutSession: (orgId: string, payload: TCreateCheckoutPayload) => Promise<TCheckoutResult>;
  createPortalSession: (orgId: string, payload: TCreatePortalPayload) => Promise<TSessionResponse>;
};
