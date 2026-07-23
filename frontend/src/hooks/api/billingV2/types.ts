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

// Deprecation detail rendered to the user. date is a formatted display string, daysLeft is whole days
// until the sunset (>= 0); both null when no date was supplied.
export type BillingV2Deprecation = {
  reason?: string;
  nextSteps?: string;
  date: string | null;
  daysLeft: number | null;
};

// A single purchasable (or sales-led) plan of a product. The free tier is implicit and never listed.
export type BillingV2Plan = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  // Offers a self-serve trial; the trial CTA shows only when selfServe && trialable.
  trialable: boolean;
  // Kept for existing customers, closed to new ones; deprecation carries the reason/nextSteps/date.
  deprecated?: boolean;
  deprecation?: BillingV2Deprecation;
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
  // Kept for existing customers, closed to new ones (supersedes plan deprecation).
  deprecated?: boolean;
  deprecation?: BillingV2Deprecation;
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
  // Whether this customer can commit this dimension annually, per their pinned plan version (from the
  // subscription read, NOT the catalog). Grandfather-safe: a later catalog price won't flip it on for a
  // customer on an older version. Gate the commit action on this for products the customer owns.
  commitAvailable: boolean;
  committedRate?: number;
  onDemandRate?: number;
  rate?: number;
  freeBand?: number;
  onDemandAmount: number;
  // Annual-commitment lifecycle. canDecreaseNow is false until the final window before renewal, so the
  // UI locks the commitment stepper's floor to the current committed quantity until then. renewalDate
  // and decreaseAllowedFrom are formatted display dates.
  canDecreaseNow?: boolean;
  renewalDate?: string | null;
  decreaseAllowedFrom?: string | null;
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
  // Present when this entitled product (or its plan) is deprecated. kind "product" is terminal (being
  // discontinued); kind "plan" is a plan retiring with a forward path. Product supersedes plan.
  deprecation?: BillingV2Deprecation & { kind: "product" | "plan" };
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
  // Product keys whose one-per-product trial is used up (any outcome); gates the trial CTA.
  trialedProductKeys: string[];
  // Mutating billing actions are frozen server-side; the UI disables purchase/commit/remove controls.
  checkoutFrozen: boolean;
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

// Buy/add one product. The server self-selects append vs Checkout. quantities are buyer-entered
// per-dimension values; the server fills any non-entered per_resource dim. Commitment is a separate
// step (useChangeBillingV2Commitment). prorationDate is echoed from a prior preview.
export type TBuyBillingV2ProductDTO = {
  orgId: string;
  productId: string;
  plan?: string;
  cadence?: BillingV2Cadence;
  quantities?: Record<string, number>;
  returnPath?: string;
  prorationDate?: number;
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

// prorationAmount is this change's cost (signed: positive is charged now, negative a credit).
// additionalCharges are earlier mid-cycle changes still unbilled that an invoice-now apply settles in
// the same charge; totalDueNow (= prorationAmount + additionalCharges) is what actually hits the card
// and is the figure to show as "charged now". prorationDate is echoed into the apply so the applied
// charge matches the preview.
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
  // Buyer-entered per-dimension quantities for the add (e.g. annual commitment amounts); the server
  // fills any non-entered per_resource dim, so the previewed charge matches the buy.
  quantities?: Record<string, number>;
  removeProductId?: string;
  // Per_resource commitment quantity changes to preview against the existing subscription.
  commitmentChanges?: BillingV2CommitmentChange[];
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  productId: string;
};

// Start / change annual commitments across dimensions in one atomic call. An increase is charged now;
// a decrease is rejected server-side unless the dimension's window is open. prorationDate is echoed
// from a prior preview.
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

export type TCancelBillingV2TrialDTO = {
  orgId: string;
  productId: string;
};

// The trial is granted immediately (outcome is always trial_started). cardSetupUrl, when present, is a
// best-effort setup-mode Checkout to add a card; the client redirects to it, else shows a card-required
// banner. The card never gates the trial.
export type BillingV2TrialResult = {
  outcome: "trial_started";
  cardSetupUrl?: string;
};

export type BillingV2TrialCancelResult = {
  outcome: "trial_completed";
};

export type TBillingV2LifecycleDTO = {
  orgId: string;
};
