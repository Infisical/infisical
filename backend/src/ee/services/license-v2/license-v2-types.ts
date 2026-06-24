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
  fromPrice?: string;
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

export type BillingV2Entitlement = {
  entitled: boolean;
  limit?: number | null;
  used?: number;
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
  billingDetails: { name: string; email: string } | null;
  invoices: BillingV2Invoice[];
  entitlements: Record<string, BillingV2Entitlement>;
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

export type BillingV2Preview = {
  currency: string;
  prorationAmount: number;
  nextInvoiceTotal: number;
  nextRecurringTotal: number;
  prorationDate: number;
  lines: BillingV2PreviewLine[];
};

export type TPreviewBillingV2ChangeDTO = {
  orgId: string;
  actor: OrgServiceActor;
  addProductId?: string;
  cadence?: "monthly" | "annual";
  removeProductId?: string;
};

export type TAddBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  cadence?: "monthly" | "annual";
};

export type TRemoveBillingV2ProductDTO = {
  orgId: string;
  actor: OrgServiceActor;
  productId: string;
  prorationDate?: number;
};

export type TBillingV2SubscriptionLifecycleDTO = {
  orgId: string;
  actor: OrgServiceActor;
};
