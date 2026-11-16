import { BillingCatalogPlan, BillingCatalogProduct, BillingOverview } from "./types";

// Render cloud preview only: there is no license server behind this deployment, so the billing
// overview and catalog are served from these fixtures to make the upgrade dialog match Infisical Cloud
// for an org on the free plan.

const freePlan: BillingCatalogPlan = {
  tier: "free",
  name: "Free",
  selfServe: false,
  salesLed: false,
  trialable: false,
  upgradeable: false,
  trialDays: 0,
  displayOrder: 0,
  dims: []
};

const identityDim = (monthly: number, annual: number) => ({
  key: "identities",
  label: "Identities",
  noun: "identity",
  monthly,
  annual,
  included: 0
});

export const RENDER_CLOUD_PREVIEW_CATALOG: BillingCatalogProduct[] = [
  {
    id: "secrets_manager",
    name: "Secrets Management",
    icon: "key_round",
    color: "var(--color-product-sm)",
    displayOrder: 0,
    baselinePlan: freePlan,
    plans: [
      {
        ...freePlan,
        tier: "pro",
        name: "Pro",
        selfServe: true,
        trialable: true,
        upgradeable: true,
        trialDays: 14,
        displayOrder: 1,
        dims: [identityDim(23, 216)]
      },
      {
        ...freePlan,
        tier: "advanced",
        name: "Advanced",
        selfServe: true,
        upgradeable: true,
        displayOrder: 2,
        dims: [identityDim(32, 312)]
      },
      {
        ...freePlan,
        tier: "enterprise",
        name: "Enterprise",
        salesLed: true,
        displayOrder: 3
      }
    ],
    compare: [
      { label: "Environments", cells: { free: 3, pro: 6, advanced: 12, enterprise: "Unlimited" } },
      { label: "Integrations", cells: { free: 10, pro: 25, advanced: 50, enterprise: "Unlimited" } },
      {
        label: "Audit log retention",
        cells: { free: false, pro: "30-Day", advanced: "90-Day", enterprise: "Custom" }
      },
      {
        label: "Honey tokens",
        cells: { free: false, pro: "Up to 3", advanced: "Up to 25", enterprise: "Unlimited" }
      },
      { label: "Secret versioning", cells: { free: true, pro: true, advanced: true, enterprise: true } },
      {
        label: "Point-in-time recovery",
        cells: { free: false, pro: true, advanced: true, enterprise: true }
      },
      { label: "RBAC", cells: { free: false, pro: true, advanced: true, enterprise: true } },
      { label: "Dynamic secrets", cells: { free: false, pro: false, advanced: true, enterprise: true } },
      { label: "Temporary access", cells: { free: false, pro: false, advanced: true, enterprise: true } },
      { label: "Gateways", cells: { free: false, pro: false, advanced: true, enterprise: true } },
      { label: "SCIM", cells: { free: false, pro: false, advanced: false, enterprise: true } },
      {
        label: "Audit log streaming",
        cells: { free: false, pro: false, advanced: false, enterprise: true }
      }
    ]
  }
];

export const RENDER_CLOUD_PREVIEW_OVERVIEW: BillingOverview = {
  isCloud: true,
  mode: "self-serve",
  subState: "no-subscription",
  planName: "Free",
  billing: { monthlyRecurring: 0, annualCommitted: 0, activeProductCount: 0, nextCharge: null },
  onDemandAmount: 0,
  payment: null,
  billingDetails: null,
  invoices: [],
  entitlements: { secrets_manager: { entitled: false } },
  trialedProductKeys: [],
  trials: [],
  trialPaymentDue: null,
  paymentAlert: null,
  checkoutFrozen: false,
  selfServe: true
};
