import { OrgServiceActor } from "@app/lib/types";

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
// Deprecation detail rendered to the user. date is a formatted display string; daysLeft is whole days
// until the sunset (>= 0), both null when no date was supplied. Present only when something is deprecated.
export type BillingV2Deprecation = {
  reason?: string;
  nextSteps?: string;
  date: string | null;
  daysLeft: number | null;
};

export type BillingV2Plan = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  // Offers a self-serve trial; the UI shows a trial CTA only when selfServe && trialable.
  trialable: boolean;
  // Kept for existing customers, closed to new ones. deprecation carries the reason/nextSteps/date.
  deprecated?: boolean;
  deprecation?: BillingV2Deprecation;
  // Sort key within the product; the UI orders plan cards by it.
  displayOrder?: number;
  feature?: string;
  base?: { monthly: number; annual: number };
  dims: BillingV2Dim[];
};

export type BillingV2CatalogProduct = {
  id: string;
  name: string;
  icon: string;
  color: string;
  addon?: boolean;
  tagline?: string;
  // Kept for existing customers, closed to new ones (supersedes plan deprecation).
  deprecated?: boolean;
  deprecation?: BillingV2Deprecation;
  // Sort key across products; the UI orders the product list by it.
  displayOrder?: number;
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

// One dimension of an active product, resolved for display from the org's version-pinned subscription
// (label/noun from the catalog). Rates are in dollars. An annual per_resource dimension carries
// committed + committedRate (annual) + onDemandRate (monthly overage); a metered dimension carries
// rate + freeBand. onDemandAmount is the computed monthly overage cost, max(0, used - committed) *
// onDemandRate (0 unless annually committed with overflow).
export type BillingV2EntitlementDim = {
  key: string;
  label: string;
  noun: string;
  unit: string;
  metered: boolean;
  cadence: "monthly" | "annual" | null;
  used: number;
  limit: number | null;
  committed: number | null;
  // Whether this customer can commit this dimension annually, per their pinned plan version (from the
  // subscription read, NOT the catalog). Grandfather-safe; the UI gates the commit action on this.
  commitAvailable: boolean;
  committedRate?: number;
  onDemandRate?: number;
  rate?: number;
  freeBand?: number;
  onDemandAmount: number;
  // Annual-commitment lifecycle, present only for a real per_resource commitment. canDecreaseNow is
  // false until the final window before renewal (a decrease is rejected until then); renewalDate and
  // decreaseAllowedFrom are formatted display dates.
  canDecreaseNow?: boolean;
  renewalDate?: string | null;
  decreaseAllowedFrom?: string | null;
};

export type BillingV2Entitlement = {
  entitled: boolean;
  // Tier the org is currently subscribed to for this product (from the subscription item), so the UI
  // can mark the matching plan card as the active one. Absent for feature-only entitlements.
  planTier?: string;
  // Product-level cadence: "annual" when any dimension is annually committed, else "monthly". Drives
  // the YEARLY/MONTHLY badge and the "/ year" vs "/ month" headline period.
  cadence?: "monthly" | "annual" | null;
  // Recurring charge for this product (dollars): the annual committed total for a yearly product, the
  // monthly total for a monthly product (item.amount).
  amount?: number;
  // Monthly on-demand overage cost across the product's annually-committed dimensions (dollars), for
  // the "+ $X / mo on-demand" line. 0 when there is no overflow.
  onDemandAmount?: number;
  // Every priced/metered dimension of the product, for the per-dimension usage bars.
  dimensions?: BillingV2EntitlementDim[];
  // Trial state for the product line. trialEndsAt is a formatted date (null when not trialing).
  status?: string;
  isTrialing?: boolean;
  trialEndsAt?: string | null;
  // Formatted date this product's soonest line renews (each product bills on its own cycle); null when
  // the product has no dated line (e.g. feature-only entitlements).
  renewsOn?: string | null;
  // Present when this entitled product (or its plan) is deprecated. kind = "product" is terminal (the
  // product is being discontinued); kind = "plan" is a plan retiring with a forward path. Product wins.
  deprecation?: BillingV2Deprecation & { kind: "product" | "plan" };
  limit?: number | null;
  used?: number;
  // Singular noun for the limited dimension (e.g. "certificate"), resolved from the catalog so the
  // UI can render the unit beside the count ("0 / 100 certificates").
  unit?: string | null;
};

// The next invoice event: the soonest line to close. amount/cadence come from the lines closing on
// that date; hasUsage flags that a usage-based line shares it, so the amount is an estimate.
export type BillingV2NextCharge = {
  amount: number;
  at: string;
  productKeys: string[];
  cadence: "monthly" | "annual" | null;
  hasUsage: boolean;
};

// Header billing summary. monthlyRecurring and annualCommitted are two independent clocks (never
// summed). activeProductCount is how many products the org holds. nextCharge is null when nothing is due.
export type BillingV2Billing = {
  monthlyRecurring: number;
  annualCommitted: number;
  activeProductCount: number;
  nextCharge: BillingV2NextCharge | null;
};

export type BillingV2Overview = {
  isCloud: boolean;
  mode: BillingV2Mode;
  subState: BillingV2SubState;
  planName: string;
  billing: BillingV2Billing;
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
  // Product keys whose one-per-product trial is used up (any outcome); the UI gates the trial CTA on it.
  trialedProductKeys: string[];
  // Total monthly on-demand overage across all products (dollars), for the summary's on-demand note.
  onDemandAmount: number;
  checkoutFrozen: boolean;
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

export type TBuyBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  // Which plan tier of the product to purchase; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
  quantities?: Record<string, number>;
  email?: string;
  returnPath?: string;
  // Echoed from a prior preview so the applied charge matches the previewed one.
  prorationDate?: number;
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

export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  additionalCharges: number;
  totalDueNow: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate?: number | null;
  lines: BillingV2PreviewLine[];
};

// A single per_resource commitment quantity change, shared by preview and apply.
export type BillingV2CommitmentChange = {
  dimensionKey: string;
  quantity: number;
};

export type TPreviewBillingV2ChangeDTO = {
  orgId: string;
  actor: OrgServiceActor;
  addProductId?: string;
  // Plan tier of the product being added; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
  quantities?: Record<string, number>;
  removeProductId?: string;
  // Per_resource commitment quantity changes to preview against the existing subscription.
  commitmentChanges?: BillingV2CommitmentChange[];
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
};

// Start / change annual commitments across dimensions in one atomic call. Increase is charged now; a
// decrease is rejected by the server unless the dimension's decrease window is open. prorationDate is
// echoed from a prior preview for dimensions that already have a commit item.
export type TChangeBillingV2CommitmentDTO = {
  orgId: string;
  actor: OrgServiceActor;
  changes: BillingV2CommitmentChange[];
  prorationDate?: number;
};

export type TStartBillingV2TrialDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  plan: string;
  // Billing email for the trial; a trial has no Stripe customer yet, so the server needs it up front.
  email?: string;
};

export type TCancelBillingV2TrialDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
};

export type TBillingV2SubscriptionLifecycleDTO = {
  orgId: string;
  actor: OrgServiceActor;
};
