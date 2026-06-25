export type BillingV2Model = "seat" | "usage" | "limit" | "flat";

export type BillingV2Cadence = "monthly" | "annual";

export type BillingV2Dim = {
  key: string;
  label: string;
  noun: string;
  monthly: number;
  annual: number;
  included: number;
};

export type BillingV2CompareRow = {
  label: string;
  pro: string | boolean;
  ent: string | boolean;
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
  pro: {
    base?: { monthly: number; annual: number };
    dims?: BillingV2Dim[];
    proFeature: string;
    planKey?: string;
  };
  enterprise: { sales: true; feature: string } | null;
  upgradeChanges?: { add: string[] };
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

export type BillingV2Entitlement = {
  entitled: boolean;
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
  cadence?: BillingV2Cadence;
  email?: string;
  returnPath?: string;
};

export type TAddBillingV2PaymentMethodDTO = {
  orgId: string;
  returnPath?: string;
};
