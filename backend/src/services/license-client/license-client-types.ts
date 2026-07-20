import { z } from "zod";

const entitlementFeatureSchema = z.object({
  value: z.union([z.boolean(), z.number(), z.string()]).nullable(),
  source: z.string().optional(),
  from_product: z.string().optional(),
  expires_at: z.string().nullish()
});

// The products a customer is entitled to. This is the authoritative entitlement list: an entitlement
// can exist (paygo / account-based) without a Stripe subscription mirror, and the feature map may be
// all defaults, so a product's active/trialing state must be read from here, not just features.
const entitlementProductSchema = z
  .object({
    product_key: z.string(),
    plan_key: z.string().nullish(),
    status: z.string().nullish(), // active | trialing | grace | churned
    trial_ends_at: z.string().nullish(),
    current_period_end: z.string().nullish()
  })
  .passthrough();

// `features` and `products` are load-bearing; passthrough tolerates the rest of the payload so
// cloud/self-hosted version skew doesn't break reads.
export const entitlementsResponseSchema = z
  .object({
    features: z.record(z.string(), entitlementFeatureSchema),
    products: z.array(entitlementProductSchema).default([])
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
    // Permissive (like model/tier/cadence) so a new License Server kind can't break parsing; normalized in code.
    kind: z.string().default("per_unit"),
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
    // Offers a self-serve trial; a plan is trialable only when selfServe && trialable.
    trialable: z.boolean().default(false),
    // true = kept for existing customers, closed to new ones. reason/nextSteps/date shown when true.
    deprecated: z.boolean().default(false),
    deprecationReason: z.string().nullish(),
    deprecationNextSteps: z.string().nullish(),
    // Sunset date. Number (unix) or ISO string depending on server; normalized in code.
    deprecationDate: z.union([z.number(), z.string()]).nullish(),
    // Sort key within the product; the server already returns plans sorted by it.
    displayOrder: z.number().nullish(),
    feature: z.string().optional(),
    basePriceMonthlyCents: z.number().nullish(),
    basePriceAnnualCents: z.number().nullish(),
    prices: z.array(catalogPlanPriceSchema).default([])
  })
  .passthrough();

const catalogComparisonCellSchema = z
  .object({
    tier: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()])
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
    tagline: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
    addon: z.boolean(),
    // true = kept for existing customers, closed to new ones. Supersedes plan deprecation.
    deprecated: z.boolean().default(false),
    deprecationReason: z.string().nullish(),
    deprecationNextSteps: z.string().nullish(),
    deprecationDate: z.union([z.number(), z.string()]).nullish(),
    // Sort key across products; the server already returns products sorted by it.
    displayOrder: z.number().nullish(),
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

// A dimension descriptor on a subscription item (the org's version-pinned billing view). Rates are
// grandfathered, so they reflect what the customer is billed, not the current catalog price.
// - cadence is per dimension ("annual" | "monthly" | ""); do NOT infer it from the top-level cadence
//   or from committed != null.
// - per_resource: committed (prepaid floor) + committedRateCents (annual) + onDemandRateCents (monthly
//   overage). Overflow is max(0, used - committed), costed client-side at onDemandRateCents.
// - metered: freeBand (included) + rateCents (per-unit). committed/*RateCents are null for metered;
//   rateCents/freeBand are null for per_resource.
// - limitKey is the stable feature key the dimension caps against; live per-org usage is overlaid on
//   it (dimension keys drift). limit is the optional hard feature cap, independent of committed.
// Additive + permissive so an older server (no dimensions) parses.
const subscriptionItemDimensionSchema = z
  .object({
    key: z.string(),
    limitKey: z.string().nullish(),
    // Legacy alias for limitKey emitted by pre-contract servers; the service prefers limitKey.
    featureKey: z.string().nullish(),
    unit: z.string().optional(),
    metered: z.boolean().default(false),
    aggregation: z.string().optional(),
    cadence: z.string().nullish(),
    used: z.number().default(0),
    limit: z.number().nullish(),
    committed: z.number().nullish(),
    committedRateCents: z.number().nullish(),
    onDemandRateCents: z.number().nullish(),
    freeBand: z.number().nullish(),
    rateCents: z.number().nullish()
  })
  .passthrough();

const subscriptionItemSchema = z
  .object({
    productId: z.string(),
    plan: z.string(),
    // Legacy per-unit maps, superseded by dimensions[]; the current server omits quantities entirely,
    // so default them rather than requiring them (a missing field must not fail the whole parse).
    quantities: z.record(z.string(), z.number()).default({}),
    limits: z.record(z.string(), z.number()).default({}),
    amount: z.number().optional(),
    // Trial state for the product line (from the self-serve trial work).
    status: z.string().optional(),
    isTrialing: z.boolean().default(false),
    trialEndsAt: z.number().nullish(),
    // Present only when this item's product OR plan is deprecated (product supersedes plan). The item
    // keeps working; this carries the contract-specific message (the sunset date comes from the catalog).
    deprecation: z.object({ reason: z.string().nullish(), nextSteps: z.string().nullish() }).nullish(),
    dimensions: z.array(subscriptionItemDimensionSchema).default([])
  })
  .passthrough();

// A single Stripe line on the subscription. Each line has its OWN billing cycle (a subscription can
// mix monthly and annual lines), so periods live here, not at the subscription level. usageBased
// lines carry a variable amountCents (usage-driven); fixed lines are stable. Additive + permissive.
const subscriptionLineSchema = z
  .object({
    productKey: z.string(),
    dimensionKey: z.string().nullish(),
    // "commit" | "standard" — a prepaid commitment line vs a plain recurring line.
    role: z.string().nullish(),
    cadence: z.string().nullish(),
    quantity: z.number().nullish(),
    unitAmountCents: z.number().nullish(),
    amountCents: z.number().nullish(),
    usageBased: z.boolean().default(false),
    currentPeriodStart: z.number().nullish(),
    currentPeriodEnd: z.number().nullish()
  })
  .passthrough();

// Per-line billing summary. monthly/annual recurring are the summed fixed (non-usage) lines for each
// cadence and must NOT be added together (two independent clocks). nextChargeAt is the soonest line
// currentPeriodEnd (the next invoice), null when nothing is upcoming.
const subscriptionBillingSchema = z
  .object({
    monthlyRecurringCents: z.number().default(0),
    annualRecurringCents: z.number().default(0),
    nextChargeAt: z.number().nullish(),
    lines: z.array(subscriptionLineSchema).default([])
  })
  .passthrough();

export const subscriptionResponseSchema = z
  .object({
    status: z.string(),
    // Per-line billing: there is no subscription-level cadence/period/total (a subscription can mix
    // monthly and annual lines). These top-level fields are legacy summaries kept nullish for
    // back-compat with older servers; read `billing` for the authoritative per-line view.
    cadence: z.string().nullish(),
    currentPeriodEnd: z.number().nullish(),
    recurringTotal: z.number().nullish(),
    billing: subscriptionBillingSchema.nullish(),
    tier: z.string().optional(),
    items: z.array(subscriptionItemSchema)
  })
  .passthrough();

export const sessionResponseSchema = z
  .object({
    url: z.string().url()
  })
  .passthrough();

// Result of a checkout / add / remove / commitment change. Checkout either needs the customer to
// complete a Stripe Checkout (checkout_created) or is applied directly to an existing subscription
// (subscription_updated). Removing the last product cancels the whole subscription
// (subscription_canceled).
export const checkoutResultSchema = z
  .object({
    outcome: z.enum(["checkout_created", "subscription_updated", "subscription_canceled"]),
    checkoutUrl: z.string().optional(),
    subscriptionId: z.string().optional()
  })
  .passthrough();

// Proration preview for an add/remove against an existing subscription. prorationAmount is signed:
// positive is charged now (an add), negative is a credit toward the next invoice (a removal). The
// server prorates at request time; no client-supplied timestamp is accepted (it would let a caller
// pick a cheaper proration instant), so the preview carries an amount but not a timestamp to echo.
const subscriptionPreviewLineSchema = z
  .object({
    description: z.string(),
    amount: z.number(),
    proration: z.boolean()
  })
  .passthrough();

export const subscriptionPreviewResponseSchema = z
  .object({
    currency: z.string(),
    prorationAmount: z.number(),
    nextInvoiceTotal: z.number(),
    nextRecurringTotal: z.number(),
    lines: z.array(subscriptionPreviewLineSchema).default([])
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
export type TSubscriptionPreview = z.infer<typeof subscriptionPreviewResponseSchema>;

export type TCheckoutLineItem = {
  productId: string;
  plan: string;
  cadence: string;
  // Legacy per-unit quantities (pre-commitment). Superseded by commitments for an annual per_resource
  // line; kept optional so the server tolerates either during rollout.
  quantities?: Record<string, number>;
  // Per-dimension committed quantity; REQUIRED for an annual per_resource line, omitted for monthly.
  commitments?: Record<string, number>;
};

// A single per_resource commitment quantity change (preview) applied post-purchase.
export type TCommitmentChange = {
  dimensionKey: string;
  quantity: number;
};

export type TSubscriptionPreviewPayload = {
  add?: TCheckoutLineItem[];
  remove?: string[];
  commitmentChanges?: TCommitmentChange[];
};

export type TAddSubscriptionItemsPayload = {
  items: TCheckoutLineItem[];
};

export type TCreateCheckoutPayload = {
  items: TCheckoutLineItem[];
  email?: string;
  returnPath?: string;
};

export type TCreatePortalPayload = {
  returnPath?: string;
};

// Self-serve apply of a previewed commitment change. The server prorates at commit time; the caller
// cannot supply a proration timestamp (that would let a billing user pick a cheaper instant).
export type TChangeCommitmentPayload = {
  dimensionKey: string;
  quantity: number;
};

export type TStartTrialPayload = {
  productKey: string;
  planKey: string;
  // A trial starts with no Stripe customer yet, so the server needs an email + org name to create one.
  email?: string;
  name?: string;
};

// The trial is always granted immediately (our-side, no Stripe subscription, no upfront charge), so
// outcome is always "trial_started". cardSetupUrl is a best-effort setup-mode Checkout to add a card;
// omitted when there's no customer / the portal isn't configured / the session couldn't open. The
// card never gates the trial — at trial end a worker converts (card on file) or expires to free.
const trialResultSchema = z
  .object({
    outcome: z.literal("trial_started"),
    card_setup_url: z
      .string()
      .url()
      .refine((val) => val.startsWith("http://") || val.startsWith("https://"), {
        message: "URL must start with http:// or https://"
      })
      .optional()
  })
  .passthrough();
export type TTrialResult = { outcome: "trial_started"; cardSetupUrl?: string };
export { trialResultSchema };

export type TCancelTrialPayload = {
  productKey: string;
};

// Revokes the trialing entitlement immediately (product → free) and marks the trial completed so it
// never converts. Idempotent-ish: the server 404s when there's no active trial to cancel.
const trialCancelResultSchema = z.object({ outcome: z.literal("trial_completed") }).passthrough();
export type TTrialCancelResult = { outcome: "trial_completed" };
export { trialCancelResultSchema };

// The org's trial history: any product listed here has used up its one-per-product trial (regardless
// of how it ended), so the client can gate the trial CTA instead of discovering it via a 409 on start.
const trialHistoryItemSchema = z
  .object({
    product_key: z.string(),
    plan_key: z.string().nullish(),
    // trialing | converted | expired | canceled | completed
    outcome: z.string(),
    started_at: z.number().nullish(),
    trial_ends_at: z.number().nullish()
  })
  .passthrough();
const trialsResponseSchema = z.object({ trials: z.array(trialHistoryItemSchema).default([]) }).passthrough();
export type TTrialsResponse = z.infer<typeof trialsResponseSchema>;
export { trialsResponseSchema };

export type TLicenseClientBackend = {
  fetchEntitlements: (org: TEntitlementOrg) => Promise<TEntitlementsResponse>;
  // Ask the license server to recompute/bust its cached entitlements after a license change.
  refreshEntitlements: (org: TEntitlementOrg) => Promise<void>;
  fetchCatalog: () => Promise<TCatalogResponse>;
  fetchSubscription: (orgId: string) => Promise<TSubscriptionResponse | null>;
  fetchCloudPlan: (orgId: string) => Promise<TCloudPlanResponse | null>;
  fetchBillingProfile: (orgId: string) => Promise<TBillingProfileResponse | null>;
  createCheckoutSession: (orgId: string, payload: TCreateCheckoutPayload) => Promise<TCheckoutResult>;
  createPortalSession: (orgId: string, payload: TCreatePortalPayload) => Promise<TSessionResponse>;
  previewSubscriptionChange: (orgId: string, payload: TSubscriptionPreviewPayload) => Promise<TSubscriptionPreview>;
  addSubscriptionItems: (orgId: string, payload: TAddSubscriptionItemsPayload) => Promise<TCheckoutResult>;
  removeSubscriptionItem: (orgId: string, productId: string) => Promise<TCheckoutResult>;
  // Apply a previewed per_resource commitment change (self-serve).
  changeCommitment: (orgId: string, payload: TChangeCommitmentPayload) => Promise<TCheckoutResult>;
  // Start a plan-scoped self-serve trial.
  startTrial: (orgId: string, payload: TStartTrialPayload) => Promise<TTrialResult>;
  // Cancel an in-progress trial for a product (product → free; the trial never converts).
  cancelTrial: (orgId: string, payload: TCancelTrialPayload) => Promise<TTrialCancelResult>;
  // The org's trial history, used to tell which products have already used their one-time trial.
  fetchTrials: (orgId: string) => Promise<TTrialsResponse>;
  cancelSubscription: (orgId: string) => Promise<TCheckoutResult>;
  resumeSubscription: (orgId: string) => Promise<TCheckoutResult>;
};
