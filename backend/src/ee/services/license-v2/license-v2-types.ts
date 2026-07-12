import { OrgServiceActor } from "@app/lib/types";

export type BillingV2Model = "seat" | "usage" | "limit" | "flat";

export type BillingV2SubState = "active" | "trialing" | "past-due" | "suspended" | "no-subscription";

export type BillingV2Mode = "self-serve" | "managed";

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

// A comparison row's cells are keyed by plan tier ("pro" | "advanced" | "enterprise" | ...) so the UI
// can render one column per plan instead of a fixed pro/enterprise pair.
export type BillingV2CompareRow = {
  label: string;
  cells: Record<string, string | boolean | number>;
};

// A single purchasable (or sales-led) plan within a product. A product exposes an ordered list of
// these — the free tier is implicit and never listed.
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
  pdfUrl: string;
};

// One metered/priced dimension of an active product, resolved for display: label/noun come from the
// catalog, the rest from the org's pinned subscription version. rate/freeBand (dollars/allowance) are
// present only for metered dimensions; per-unit dimensions get their rate from the catalog client-side.
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
  // Tier the org is currently subscribed to for this product (from the subscription item), so the UI
  // can mark the matching plan card as the active one. Absent for feature-only entitlements.
  planTier?: string;
  // Fixed recurring charge for this product (dollars); excludes metered usage per the contract.
  amount?: number;
  // Estimated metered usage cost for the current period (dollars); 0 when the product has no metered
  // usage. The product headline is amount + estimatedUsageAmount.
  estimatedUsageAmount?: number;
  // Every priced/metered dimension of the product, for the per-dimension usage bars.
  dimensions?: BillingV2EntitlementDim[];
  limit?: number | null;
  used?: number;
  // Singular noun for the limited dimension (e.g. "certificate"), resolved from the catalog so the
  // UI can render the unit beside the count ("0 / 100 certificates").
  unit?: string | null;
};

export type BillingV2Usage = {
  members: number;
  memberLimit: number | null;
  identities: number;
  identityLimit: number | null;
};

export type BillingV2Overview = {
  isCloud: boolean;
  mode: BillingV2Mode;
  subState: BillingV2SubState;
  planName: string;
  nextBillingDate: string | null;
  recurringAmount: number | null;
  interval: "month" | "year" | null;
  usage: BillingV2Usage;
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
  // Estimated metered usage cost for the current period across all products (dollars). Added to
  // recurringAmount for the projected next-month total shown in the summary.
  estimatedUsageAmount: number;
};

export type TGetBillingV2OverviewDTO = {
  orgId: string;
  actor: OrgServiceActor;
};

export type TGetBillingV2CatalogDTO = {
  orgId: string;
  actor: OrgServiceActor;
};

export type TCreateBillingV2PortalSessionDTO = {
  orgId: string;
  actor: OrgServiceActor;
  returnPath?: string;
};

export type TCreateBillingV2CheckoutSessionDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  // Which plan tier of the product to purchase; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
  email?: string;
  returnPath?: string;
};

export type TAddBillingV2PaymentMethodDTO = {
  orgId: string;
  actor: OrgServiceActor;
  returnPath?: string;
};

export type BillingV2PreviewLine = {
  description: string;
  amount: number;
  proration: boolean;
};

// A projected metered usage line for a change preview. rate/amount are dollars; peak is the projected
// period usage (peak for a max-aggregated dimension) and freeBand the included allowance.
export type BillingV2EstimatedUsageLine = {
  dimension: string;
  unit: string;
  peak: number;
  freeBand: number;
  rate: number;
  amount: number;
};

export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate: number;
  lines: BillingV2PreviewLine[];
  // Projected metered usage for the period (dollars) and its per-dimension breakdown. estimatedTotal
  // is nextRecurringTotal + estimatedUsage.
  estimatedUsage: number;
  estimatedUsageLines: BillingV2EstimatedUsageLine[];
  estimatedTotal: number;
};

export type TPreviewBillingV2ChangeDTO = {
  orgId: string;
  actor: OrgServiceActor;
  addProductId?: string;
  // Plan tier of the product being added; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
  removeProductId?: string;
};

export type TAddBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  // Plan tier to add; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
};

export type TBillingV2SubscriptionLifecycleDTO = {
  orgId: string;
  actor: OrgServiceActor;
};
