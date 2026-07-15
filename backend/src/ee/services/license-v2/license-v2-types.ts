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
export type BillingV2Plan = {
  tier: string;
  name: string;
  selfServe: boolean;
  salesLed: boolean;
  // Offers a self-serve trial; the UI shows a trial CTA only when selfServe && trialable.
  trialable: boolean;
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
  committedRate?: number;
  onDemandRate?: number;
  rate?: number;
  freeBand?: number;
  onDemandAmount: number;
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
  // Total monthly on-demand overage across all products (dollars), for the summary's on-demand note.
  onDemandAmount: number;
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
  // Per-dimension committed quantities; required for an annual per_resource line.
  commitments?: Record<string, number>;
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

export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate: number;
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
  // Initial per-dimension commitments for an annual add.
  commitments?: Record<string, number>;
  removeProductId?: string;
  // Per_resource commitment quantity changes to preview against the existing subscription.
  commitmentChanges?: BillingV2CommitmentChange[];
};

export type TAddBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  // Plan tier to add; defaults to the first paid self-serve plan.
  plan?: string;
  cadence?: "monthly" | "annual";
  // Per-dimension committed quantities; required for an annual per_resource line.
  commitments?: Record<string, number>;
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
};

// Apply one or more previewed per_resource commitment changes. The service loops the single-dimension
// apply per change, reusing prorationDate so the billed total matches the preview.
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
};

export type TBillingV2SubscriptionLifecycleDTO = {
  orgId: string;
  actor: OrgServiceActor;
};
