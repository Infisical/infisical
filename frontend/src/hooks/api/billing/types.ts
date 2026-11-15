export type BillingCadence = "monthly" | "annual";

export type BillingDim = {
  key: string;
  label: string;
  noun: string;
  monthly: number;
  annual: number;
  included: number;
  // When true, the matching cadence's price is a usage overage rate, not a buyer-selected quantity.
  meteredMonthly?: boolean;
  meteredAnnual?: boolean;
  // How a metered dimension's period total adds up ("sum" | "count" | "last") and its price bands.
  aggregation?: string;
  bands?: BillingBands;
};

// One band of a metered price, in dollars. upTo is inclusive and null on the last band; unitPrice is
// dollars per unit (fractions of a cent are kept); flatFee is charged once usage reaches the band.
export type BillingBand = {
  upTo: number | null;
  unitPrice: number;
  flatFee: number;
};

export type BillingBands = {
  mode: "graduated" | "volume";
  tiers: BillingBand[];
};

// A metered dimension's current billing period as the License Server rated it, priced through the
// org's pinned bands. estimatedAmount is null when the plan has no metered price for it.
export type BillingMeteredUsage = {
  periodStart: string | null;
  periodEnd: string | null;
  asOf: string | null;
  estimatedAmount: number | null;
  currentTier: number;
  nextTierAt: number | null;
  earlierInPeriod: {
    periodStart: string | null;
    periodEnd: string | null;
    used: number;
    estimatedAmount: number | null;
  }[];
  // A free trial's usage: shown, never billed, so the UI shows no amount for it.
  trial: boolean;
};

// A comparison row's cells are keyed by plan tier ("pro" | "advanced" | "enterprise" | ...) so the
// table can render one column per plan.
export type BillingCompareRow = {
  label: string;
  cells: Record<string, string | boolean | number>;
};

// Deprecation detail rendered to the user. date is a formatted display string, daysLeft is whole days
// until the sunset (>= 0); both null when no date was supplied.
export type BillingDeprecation = {
  reason?: string;
  nextSteps?: string;
  date: string | null;
  daysLeft: number | null;
};

// A single product plan. Purchasable and sales-led plans are listed in product.plans; an optional
// free plan is exposed separately as product.baselinePlan for comparison only.
export type BillingCatalogPlan = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  // Org-aware: whether this org may trial / upgrade to this plan. The server computes both from the
  // same rules the mutating endpoints enforce, so gating a CTA on them can never offer a 409.
  trialable: boolean;
  upgradeable: boolean;
  // Trial length in days; 0 when the plan offers no trial.
  trialDays: number;
  // Kept for existing customers, closed to new ones; deprecation carries the reason/nextSteps/date.
  deprecated?: boolean;
  deprecation?: BillingDeprecation;
  // Sort key within the product; plan cards render in this order.
  displayOrder?: number;
  feature?: string;
  base?: { monthly: number; annual: number };
  dims: BillingDim[];
};

export type BillingCatalogProduct = {
  id: string;
  name: string;
  icon: string;
  color: string;
  addon?: boolean;
  tagline?: string;
  // Kept for existing customers, closed to new ones (supersedes plan deprecation).
  deprecated?: boolean;
  deprecation?: BillingDeprecation;
  // Sort key across products; the product list renders in this order.
  displayOrder?: number;
  baselinePlan?: BillingCatalogPlan;
  plans: BillingCatalogPlan[];
  includes?: string[];
  compare?: BillingCompareRow[];
};

export type BillingSubState = "active" | "trialing" | "past-due" | "suspended" | "no-subscription";

export type BillingPaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
} | null;

export type BillingInvoice = {
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
export type BillingEntitlementDim = {
  key: string;
  label: string;
  noun: string;
  unit: string;
  metered: boolean;
  cadence: BillingCadence | null;
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
  // Metered only: this period's rated usage and the bands it is priced with.
  usage?: BillingMeteredUsage;
  bands?: BillingBands;
  onDemandAmount: number;
  // Annual-commitment lifecycle. canDecreaseNow is false until the final window before renewal, so the
  // UI locks the commitment stepper's floor to the current committed quantity until then. renewalDate
  // and decreaseAllowedFrom are formatted display dates.
  canDecreaseNow?: boolean;
  renewalDate?: string | null;
  decreaseAllowedFrom?: string | null;
};

export type BillingEntitlement = {
  entitled: boolean;
  // Tier the org is currently subscribed to for this product; lets the UI mark the active plan card.
  planTier?: string;
  // Product cadence: "annual" when any dimension is annually committed, else "monthly". Drives the
  // YEARLY/MONTHLY badge and the "/ year" vs "/ month" headline period.
  cadence?: BillingCadence | null;
  // Recurring charge for the product (dollars): annual committed total for yearly, monthly for monthly.
  amount?: number;
  // Monthly on-demand overage across the product's committed dimensions (dollars), for the
  // "+ $X / mo on-demand" line.
  onDemandAmount?: number;
  // Every priced/metered dimension of the product, for the per-dimension usage bars.
  dimensions?: BillingEntitlementDim[];
  // Trial state; trialEndsAt is a formatted date string (null when not trialing).
  status?: string;
  isTrialing?: boolean;
  trialEndsAt?: string | null;
  trialPlan?: string;
  trialPlanName?: string;
  trialPlanEndsAt?: string | null;
  trialPlanDaysLeft?: number | null;
  // Formatted grace deadline while the trial's conversion charge waits on the customer's bank. The
  // product stays trialing and usable until then, even though trialEndsAt has passed.
  trialPaymentDueAt?: string | null;
  trialPlanPaymentDueAt?: string | null;
  // Formatted date this product's soonest line renews (each product bills on its own cycle); null when
  // the product has no dated line.
  renewsOn?: string | null;
  // Present when this entitled product (or its plan) is deprecated. kind "product" is terminal (being
  // discontinued); kind "plan" is a plan retiring with a forward path. Product supersedes plan.
  deprecation?: BillingDeprecation & { kind: "product" | "plan" };
  limit?: number | null;
  used?: number;
  // Singular noun for the limited dimension (e.g. "certificate"); rendered, pluralized, beside the count.
  unit?: string | null;
};

export type BillingTrialOutcome =
  | "trialing"
  | "converted"
  | "expired"
  | "canceled"
  | "completed"
  | "reverted";

export type BillingTrial = {
  productKey: string;
  planTier: string | null;
  basePlanTier: string | null;
  outcome: BillingTrialOutcome | string;
  // Why the trial ended (e.g. payment_not_completed). endedDetail is a machine code only when outcome
  // is "reverted"; on "canceled" it is free text, so never map it outside that case.
  endedReason: string | null;
  endedDetail: string | null;
  endedAt: string | null;
  endedDaysAgo: number | null;
};

export type BillingOverview = {
  isCloud: boolean;
  mode: "self-serve" | "managed";
  subState: BillingSubState;
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
      cadence: BillingCadence | null;
      hasUsage: boolean;
      // What metered usage so far this period prices to (dollars); null when nothing metered is rated.
      estimatedUsage?: number | null;
    } | null;
  };
  // Total monthly on-demand overage across all products (dollars).
  onDemandAmount: number;
  payment: BillingPaymentMethod;
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
  invoices: BillingInvoice[];
  entitlements: Record<string, BillingEntitlement>;
  trialedProductKeys: string[];
  trials: BillingTrial[];
  trialPaymentDue: { dueAt: string; productKeys: string[] } | null;
  paymentAlert: { state: "needs_action" | "failed"; actionUrl: string } | null;
  // Mutating billing actions are frozen server-side; the UI disables purchase/commit/remove controls.
  checkoutFrozen: boolean;
  // false for an enterprise-managed org: render the self-serve billing UI but disable its controls
  // (trial/buy/commit/cancel), so the customer is pointed to sales rather than hitting a 403 on submit.
  selfServe: boolean;
};

// payment_action_required: the bank wants the customer to approve the charge on the Stripe invoice at
// paymentUrl, which has no return URL, so open it in a new tab rather than redirecting.
export type BillingCheckoutResult = {
  outcome: "checkout_created" | "subscription_updated" | "payment_action_required";
  checkoutUrl?: string;
  paymentUrl?: string;
  subscriptionId?: string;
};

export type TCreateBillingPortalSessionDTO = {
  orgId: string;
  returnPath?: string;
};

// Buy/add one product. The server self-selects append vs Checkout. quantities are buyer-entered
// per-dimension values; the server fills any non-entered per_resource dim. Commitment is a separate
// step (useChangeBillingCommitment).
export type TBuyBillingProductDTO = {
  orgId: string;
  productId: string;
  plan?: string;
  cadence?: BillingCadence;
  quantities?: Record<string, number>;
  returnPath?: string;
};

export type TAddBillingPaymentMethodDTO = {
  orgId: string;
  returnPath?: string;
};

export type BillingPreviewLine = {
  description: string;
  amount: number;
  proration: boolean;
};

// prorationAmount is this change's cost (signed: positive is charged now, negative a credit).
// additionalCharges are earlier mid-cycle changes still unbilled that an invoice-now apply settles in
// the same charge; totalDueNow (= prorationAmount + additionalCharges) is what actually hits the card
// and is the figure to show as "charged now".
export type BillingPreview = {
  currency: string;
  prorationAmount: number;
  additionalCharges: number;
  totalDueNow: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate?: number | null;
  // Upgrade previews only; must be echoed back on apply.
  toPlanVersionId?: string | null;
  lines: BillingPreviewLine[];
};

export type BillingMutationResult = {
  outcome?: "checkout_created" | "subscription_updated" | "payment_action_required";
  checkoutUrl?: string;
  paymentUrl?: string;
  subscriptionId?: string;
};

// A single per_resource commitment quantity change, shared by preview and apply.
export type BillingCommitmentChange = {
  dimensionKey: string;
  quantity: number;
};

export type TPreviewBillingChangeDTO = {
  orgId: string;
  addProductId?: string;
  plan?: string;
  cadence?: BillingCadence;
  // Buyer-entered per-dimension quantities for the add (e.g. annual commitment amounts); the server
  // fills any non-entered per_resource dim, so the previewed charge matches the buy.
  quantities?: Record<string, number>;
  removeProductId?: string;
  // Per_resource commitment quantity changes to preview against the existing subscription.
  commitmentChanges?: BillingCommitmentChange[];
  // Plan change for a product already held. Carries no quantities or cadence: the server moves the
  // existing lines as they are.
  upgradeProductId?: string;
  upgradePlan?: string;
};

export type TUpgradeBillingProductDTO = {
  orgId: string;
  productId: string;
  plan: string;
  expectedPlanVersionId: string;
  prorationDate?: number;
};

export type BillingUpgradeResult = {
  outcome: "upgraded" | "payment_action_required";
  paymentUrl?: string;
  subscriptionId?: string;
  fromPlanKey?: string;
  toPlanKey?: string;
};

export type TRemoveBillingProductDTO = {
  orgId: string;
  productId: string;
};

// Start / change annual commitments across dimensions in one atomic call. An increase is charged now;
// a decrease is rejected server-side unless the dimension's window is open. The change always prices
// at the current server time. productId is required: it names the product so the server resolves the
// trialing plan and creates/attaches the subscription when there isn't one yet (a trialing org).
export type TChangeBillingCommitmentDTO = {
  orgId: string;
  changes: BillingCommitmentChange[];
  productId: string;
};

export type TStartBillingTrialDTO = {
  orgId: string;
  productId: string;
  plan: string;
  returnPath?: string;
};

export type TCancelBillingTrialDTO = {
  orgId: string;
  productId: string;
};

// Card-first trial. trial_started: a card is on file, the trial is granted now. awaiting_card: no card,
// NOT granted; the client redirects to cardSetupUrl (a setup-mode Checkout) and the trial is granted by
// webhook on completion.
export type BillingTrialResult = {
  outcome: "trial_started" | "awaiting_card";
  cardSetupUrl?: string;
};

export type BillingTrialCancelResult = {
  outcome: "trial_completed";
};

export type TConfirmBillingTrialPaymentDTO = {
  orgId: string;
  returnPath?: string;
};

export type BillingConfirmTrialPaymentResult =
  | { outcome: "checkout_created" | "payment_action_required"; redirectUrl: string }
  | { outcome: "upgraded" };

// License-server machine codes the billing UI branches on (read from the error's details.code).
export const BillingErrorCode = {
  PaymentActionRequired: "payment_action_required",
  NoTrialAwaitingPayment: "no_trial_awaiting_payment"
} as const;

export type TBillingLifecycleDTO = {
  orgId: string;
};

export enum BillingBreakdownDimension {
  Identities = "identities",
  UserIdentities = "user_identities",
  SecretIdentities = "secret_identities",
  PamIdentities = "pam_identities",
  InternalCas = "internal_cas",
  ActiveCerts = "active_certs",
  WildcardCerts = "wildcard_certs"
}

export type BillingBreakdownProject = {
  id: string;
  name: string;
  count: number;
};

export type BillingBreakdownScope = {
  orgId: string;
  name: string;
  isRoot: boolean;
  parentOrgName: string | null;
  count: number;
  orgLevelCount: number;
  projects: BillingBreakdownProject[];
};

export type BillingUsageBreakdown = {
  dimensionKey: string;
  total: number;
  userCount: number;
  scopedCount: number;
  hasProjectDetail: boolean;
  unit: string;
  scopes: BillingBreakdownScope[];
};

export type BillingBreakdownScopeKind = "instance" | "organization";

export type BillingOrganization = {
  id: string;
  name: string;
  slug?: string;
};

export type BillingOrganizationsPage = {
  organizations: BillingOrganization[];
  totalCount: number;
};
