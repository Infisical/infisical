import { TCatalogProduct, TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

type TPlan = TCatalogProduct["plans"][number];

// A plan priced per identity, monthly and annually, with a metered dimension that must never be sold per unit.
export const proPlan = (overrides: Partial<TPlan> = {}): TPlan => ({
  tier: "pro",
  name: "Pro",
  selfServe: true,
  salesLed: false,
  trialable: true,
  upgradeable: false,
  trialDays: 14,
  deprecated: false,
  prices: [
    {
      dimensionKey: "secret_identities",
      cadence: "monthly",
      kind: "per_unit",
      unitAmountCents: 1800,
      includedQuantity: 5
    },
    {
      dimensionKey: "secret_identities",
      cadence: "annual",
      kind: "per_unit",
      unitAmountCents: 1500,
      includedQuantity: 5
    },
    { dimensionKey: "api_requests", cadence: "monthly", kind: "per_unit", unitAmountCents: 1 }
  ],
  ...overrides
});

export const catalogProduct = (overrides: Partial<TCatalogProduct> = {}): TCatalogProduct => ({
  id: "secrets_manager",
  name: "Secrets Manager",
  addon: false,
  deprecated: false,
  dimensions: [
    { key: "secret_identities", label: "Identities", noun: "identity", billingType: "per_resource" },
    { key: "api_requests", label: "API requests", noun: "request", billingType: "metered" }
  ],
  plans: [
    {
      tier: "free",
      name: "Free",
      selfServe: true,
      salesLed: false,
      trialable: false,
      upgradeable: false,
      deprecated: false,
      prices: []
    },
    proPlan(),
    {
      tier: "enterprise",
      name: "Enterprise",
      selfServe: false,
      salesLed: true,
      trialable: false,
      upgradeable: false,
      deprecated: false,
      prices: []
    }
  ],
  comparison: [],
  includes: [],
  ...overrides
});

export const catalog = (...products: TCatalogProduct[]) => ({
  products: products.length ? products : [catalogProduct()]
});

export const subscription = (overrides: Partial<TSubscriptionResponse> = {}): TSubscriptionResponse => ({
  status: "active",
  items: [{ productId: "secrets_manager", plan: "pro", quantities: {}, limits: {}, isTrialing: false, dimensions: [] }],
  ...overrides
});
