export type BillingV2Model = "seat" | "usage" | "limit" | "flat";

export type BillingV2Cadence = "monthly" | "annual";

export type BillingV2Dim = {
  key: string;
  label: string;
  noun: string;
  monthly: number;
  annual: number;
  included: number;
  // When true, the matching cadence's price is a usage overage rate, not a buyer-selected quantity.
  meteredMonthly?: boolean;
  meteredAnnual?: boolean;
};

// A comparison row's cells are keyed by plan tier ("pro" | "advanced" | "enterprise" | ...) so the
// table can render one column per plan.
export type BillingV2CompareRow = {
  label: string;
  cells: Record<string, string | boolean | number>;
};

// A single purchasable (or sales-led) plan of a product. The free tier is implicit and never listed.
export type BillingV2Plan = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  feature?: string;
  base?: { monthly: number; annual: number };
  dims: BillingV2Dim[];
};

export type BillingV2CatalogProduct = {
  id: string;
  name: string;
  icon: string;
  color: string;
  model: BillingV2Model;
  addon?: boolean;
  desc: string;
  tagline?: string;
  plans: BillingV2Plan[];
  includes?: string[];
  compare?: BillingV2CompareRow[];
};

export type BillingV2SubState =
  | "active"
  | "trialing"
  | "past-due"
  | "suspended"
  | "no-subscription";

export type BillingV2PaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export type BillingV2Invoice = {
  id: string;
  number: string;
  date: string;
  amount: number;
  paid: boolean;
  pdfUrl: string | null;
};

// One priced/metered dimension of an active product, resolved for display by the backend. rate and
// freeBand (dollars/allowance) are present only for metered dimensions; per-unit dimensions get their
// rate from the catalog on the client.
export type BillingV2EntitlementDim = {
  key: string;
  label: string;
  noun: string;
  unit: string;
  metered: boolean;
  used: number;
  limit: number | null;
  freeBand?: number;
  rate?: number;
};

export type BillingV2Entitlement = {
  entitled: boolean;
  // Tier the org is currently subscribed to for this product; lets the UI mark the active plan card.
  planTier?: string;
  // Fixed recurring charge for this product (dollars); excludes metered usage.
  amount?: number;
  // Estimated metered usage cost for the current period (dollars). The product headline is
  // amount + estimatedUsageAmount.
  estimatedUsageAmount?: number;
  // Every priced/metered dimension of the product, for the per-dimension usage bars.
  dimensions?: BillingV2EntitlementDim[];
  limit?: number | null;
  used?: number;
  // Singular noun for the limited dimension (e.g. "certificate"); rendered, pluralized, beside the count.
  unit?: string | null;
};

export type BillingV2Overview = {
  isCloud: boolean;
  mode: "self-serve" | "managed";
  subState: BillingV2SubState;
  planName: string;
  nextBillingDate: string | null;
  recurringAmount: number | null;
  interval: "month" | "year" | null;
  usage: {
    members: number;
    memberLimit: number | null;
    identities: number;
    identityLimit: number | null;
  };
  // Projected metered usage across all products (dollars); added to recurringAmount for the summary's
  // next-month total.
  estimatedUsageAmount: number;
  payment: BillingV2PaymentMethod;
  billingDetails: {
    name: string;
    email: string;
    address: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    } | null;
    taxIds: { type: string; value: string }[];
  } | null;
  invoices: BillingV2Invoice[];
  entitlements: Record<string, BillingV2Entitlement>;
};

export type BillingV2CheckoutResult = {
  outcome: "checkout_created" | "subscription_updated";
  checkoutUrl?: string;
  subscriptionId?: string;
};

export type TCreateBillingV2PortalSessionDTO = {
  orgId: string;
  returnPath?: string;
};

export type TCreateBillingV2CheckoutSessionDTO = {
  orgId: string;
  productId: string;
  plan?: string;
  cadence?: BillingV2Cadence;
  email?: string;
  returnPath?: string;
};

export type TAddBillingV2PaymentMethodDTO = {
  orgId: string;
  returnPath?: string;
};

export type BillingV2PreviewLine = {
  description: string;
  amount: number;
  proration: boolean;
};

// A projected metered usage line for a change preview. rate/amount are dollars; peak is the projected
// period usage and freeBand the included allowance.
export type BillingV2EstimatedUsageLine = {
  dimension: string;
  unit: string;
  peak: number;
  freeBand: number;
  rate: number;
  amount: number;
};

// prorationAmount is signed: positive is charged now (an add), negative is a credit toward the next
// invoice (a removal). prorationDate is the timestamp the preview was computed at, for display only.
export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate: number;
  lines: BillingV2PreviewLine[];
  // Projected metered usage for the period (dollars) and its breakdown; estimatedTotal is
  // nextRecurringTotal + estimatedUsage.
  estimatedUsage: number;
  estimatedUsageLines: BillingV2EstimatedUsageLine[];
  estimatedTotal: number;
};

export type BillingV2MutationResult = {
  subscriptionId?: string;
};

export type TPreviewBillingV2ChangeDTO = {
  orgId: string;
  addProductId?: string;
  plan?: string;
  cadence?: BillingV2Cadence;
  removeProductId?: string;
};

export type TAddBillingV2ProductDTO = {
  orgId: string;
  productId: string;
  plan?: string;
  cadence?: BillingV2Cadence;
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  productId: string;
};

export type TBillingV2LifecycleDTO = {
  orgId: string;
};
