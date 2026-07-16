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
  // Offers a self-serve trial; the trial CTA shows only when selfServe && trialable.
  trialable: boolean;
  // Sort key within the product; plan cards render in this order.
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
  // Sort key across products; the product list renders in this order.
  displayOrder?: number;
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

// One dimension of an active product, resolved for display by the backend (rates in dollars). An
// annual per_resource dimension carries committed + committedRate (annual) + onDemandRate (monthly
// overage); a metered dimension carries rate + freeBand. onDemandAmount is the computed monthly
// overage cost (max(0, used - committed) * onDemandRate).
export type BillingV2EntitlementDim = {
  key: string;
  label: string;
  noun: string;
  unit: string;
  metered: boolean;
  cadence: BillingV2Cadence | null;
  used: number;
  limit: number | null;
  committed: number | null;
  committedRate?: number;
  onDemandRate?: number;
  rate?: number;
  freeBand?: number;
  onDemandAmount: number;
};

export type BillingV2Entitlement = {
  entitled: boolean;
  // Tier the org is currently subscribed to for this product; lets the UI mark the active plan card.
  planTier?: string;
  // Product cadence: "annual" when any dimension is annually committed, else "monthly". Drives the
  // YEARLY/MONTHLY badge and the "/ year" vs "/ month" headline period.
  cadence?: BillingV2Cadence | null;
  // Recurring charge for the product (dollars): annual committed total for yearly, monthly for monthly.
  amount?: number;
  // Monthly on-demand overage across the product's committed dimensions (dollars), for the
  // "+ $X / mo on-demand" line.
  onDemandAmount?: number;
  // Every priced/metered dimension of the product, for the per-dimension usage bars.
  dimensions?: BillingV2EntitlementDim[];
  // Trial state; trialEndsAt is a formatted date string (null when not trialing).
  status?: string;
  isTrialing?: boolean;
  trialEndsAt?: string | null;
  // Formatted date this product's soonest line renews (each product bills on its own cycle); null when
  // the product has no dated line.
  renewsOn?: string | null;
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
  // Header billing summary. monthlyRecurring and annualCommitted are two independent clocks (never
  // summed). activeProductCount is how many products the org holds. nextCharge is the soonest line to
  // close (null when nothing is due); its amount is an estimate when hasUsage is true.
  billing: {
    monthlyRecurring: number;
    annualCommitted: number;
    activeProductCount: number;
    nextCharge: {
      amount: number;
      at: string;
      productKeys: string[];
      cadence: BillingV2Cadence | null;
      hasUsage: boolean;
    } | null;
  };
  // Total monthly on-demand overage across all products (dollars).
  onDemandAmount: number;
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
  // Per-dimension committed quantities; required for an annual per_resource line.
  commitments?: Record<string, number>;
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

// prorationAmount is signed: positive is charged now (an add), negative is a credit toward the next
// invoice (a removal). prorationDate is the timestamp the preview was computed at, for display only.
export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate: number;
  lines: BillingV2PreviewLine[];
};

export type BillingV2MutationResult = {
  subscriptionId?: string;
};

// A single per_resource commitment quantity change, shared by preview and apply.
export type BillingV2CommitmentChange = {
  dimensionKey: string;
  quantity: number;
};

export type TPreviewBillingV2ChangeDTO = {
  orgId: string;
  addProductId?: string;
  plan?: string;
  cadence?: BillingV2Cadence;
  // Initial per-dimension commitments for an annual add.
  commitments?: Record<string, number>;
  removeProductId?: string;
  // Per_resource commitment quantity changes to preview against the existing subscription.
  commitmentChanges?: BillingV2CommitmentChange[];
};

export type TAddBillingV2ProductDTO = {
  orgId: string;
  productId: string;
  plan?: string;
  cadence?: BillingV2Cadence;
  // Per-dimension committed quantities; required for an annual per_resource line.
  commitments?: Record<string, number>;
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  productId: string;
};

// Apply one or more previewed per_resource commitment changes; the backend loops the per-dimension
// apply, reusing prorationDate so the billed total matches the preview.
export type TChangeBillingV2CommitmentDTO = {
  orgId: string;
  changes: BillingV2CommitmentChange[];
  prorationDate?: number;
};

export type TStartBillingV2TrialDTO = {
  orgId: string;
  productId: string;
  plan: string;
};

// trial_started: attached directly. collect_payment_method: complete the setup Checkout at checkoutUrl
// to add a card (the trial then auto-starts via webhook).
export type BillingV2TrialResult = {
  outcome: "trial_started" | "collect_payment_method";
  checkoutUrl?: string;
};

export type TBillingV2LifecycleDTO = {
  orgId: string;
};
