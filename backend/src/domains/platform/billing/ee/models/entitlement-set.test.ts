import { TCatalogProduct, TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

import { BillingDate } from "./billing-date";
import { EntitlementSet, TCatalogRecord, TEntitlementsRecord } from "./entitlement-set";

type TItem = TSubscriptionResponse["items"][number];
type TDim = TItem["dimensions"][number];

const NOW = new Date("2026-11-27T12:00:00Z");

const dim = (overrides: Partial<TDim> = {}): TDim => ({
  key: "identities",
  metered: false,
  used: 0,
  commitAvailable: false,
  ...overrides
});

const item = (overrides: Partial<TItem> = {}): TItem => ({
  productId: "secrets",
  plan: "pro",
  quantities: {},
  limits: {},
  isTrialing: false,
  dimensions: [],
  ...overrides
});

const catalogProduct = (overrides: Partial<TCatalogProduct> = {}): TCatalogProduct => ({
  id: "secrets",
  name: "Secrets",
  addon: false,
  deprecated: false,
  dimensions: [{ key: "identities", label: "Machine identities", noun: "identity" }],
  plans: [
    {
      tier: "pro",
      name: "Pro",
      selfServe: true,
      salesLed: false,
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

const entitlements = (overrides: Partial<TEntitlementsRecord> = {}): TEntitlementsRecord => ({
  features: {},
  products: [],
  ...overrides
});

const build = ({
  items = [],
  catalog = null,
  entitlementsRecord = null
}: {
  items?: TItem[];
  catalog?: TCatalogRecord | null;
  entitlementsRecord?: TEntitlementsRecord | null;
}) =>
  EntitlementSet.build({
    subscription: { status: "active", items },
    catalog,
    entitlements: entitlementsRecord,
    now: NOW
  });

describe("EntitlementSet.build dimensions", () => {
  test("should label a dimension from the catalog, and fall back to its key when the catalog could not be read", () => {
    // Setup
    const items = [item({ dimensions: [dim({ unit: undefined })] })];
    const withCatalog = build({ items, catalog: { products: [catalogProduct()] } });
    const withoutCatalog = build({ items, catalog: null });

    // Action
    const result = [withCatalog.toJSON().secrets.dimensions?.[0], withoutCatalog.toJSON().secrets.dimensions?.[0]];

    // Assert
    expect(result[0]).toMatchObject({ label: "Machine identities", noun: "identity" });
    expect(result[1]).toMatchObject({ label: "identities", noun: "identities" });
  });

  test("should cost on-demand overage as the units over the commitment times the rate, and nothing under it", () => {
    // Setup
    const over = dim({ key: "over", used: 130, committed: 100, onDemandRateCents: 250 });
    const under = dim({ key: "under", used: 80, committed: 100, onDemandRateCents: 250 });
    const set = build({ items: [item({ dimensions: [over, under] })] });

    // Action
    const [overView, underView] = set.toJSON().secrets.dimensions ?? [];

    // Assert
    expect(overView.onDemandAmount).toBe(75);
    expect(underView.onDemandAmount).toBe(0);
  });

  test("should sum the on-demand amount across products", () => {
    // Setup
    const set = build({
      items: [
        item({ productId: "secrets", dimensions: [dim({ used: 110, committed: 100, onDemandRateCents: 100 })] }),
        item({ productId: "pam", dimensions: [dim({ key: "pam", used: 25, committed: 20, onDemandRateCents: 200 })] })
      ]
    });

    // Action
    const total = set.onDemandAmount();

    // Assert
    expect(total).toBe(20);
  });

  test("should read a dimension's cadence from the dimension itself and the item as annual when any is annual", () => {
    // Setup
    const set = build({
      items: [
        item({ productId: "mixed", dimensions: [dim({ cadence: "monthly" }), dim({ key: "b", cadence: "annual" })] }),
        item({ productId: "monthly", dimensions: [dim({ cadence: "" })] })
      ]
    });

    // Action
    const json = set.toJSON();

    // Assert
    expect(json.mixed.cadence).toBe("annual");
    expect(json.monthly.cadence).toBe("monthly");
    expect(json.monthly.dimensions?.[0].cadence).toBeNull();
  });
});

describe("EntitlementSet.build limits", () => {
  test("should report the most constraining limit, the one with the highest utilization", () => {
    // Setup
    const set = build({
      items: [
        item({
          dimensions: [
            dim({ key: "roomy", used: 10, limit: 100 }),
            dim({ key: "tight", used: 9, limit: 10 }),
            dim({ key: "uncapped", used: 500, limit: null })
          ]
        })
      ]
    });

    // Action
    const { used, limit } = set.toJSON().secrets;

    // Assert
    expect([used, limit]).toEqual([9, 10]);
  });
});

describe("EntitlementSet.build deprecation", () => {
  const sunset = new Date("2026-12-07T12:00:00Z");
  const deprecatedPlan = (): TCatalogProduct["plans"][number] => ({
    ...catalogProduct().plans[0],
    deprecated: true,
    deprecationReason: "Plan retired",
    deprecationDate: sunset.toISOString()
  });

  test("should let a deprecated product beat a deprecated plan", () => {
    // Setup
    const product = catalogProduct({
      deprecated: true,
      deprecationReason: "Product discontinued",
      deprecationDate: sunset.toISOString(),
      plans: [deprecatedPlan()]
    });
    const set = build({ items: [item()], catalog: { products: [product] } });

    // Action
    const { deprecation } = set.toJSON().secrets;

    // Assert
    expect(deprecation).toEqual({
      kind: "product",
      reason: "Product discontinued",
      nextSteps: undefined,
      date: BillingDate.longFromDate(sunset),
      daysLeft: 10
    });
  });

  test("should fall back to the plan's deprecation, with the item's own reason winning over the catalog's", () => {
    // Setup
    const set = build({
      items: [item({ deprecation: { reason: "Your contract ends", nextSteps: "Talk to sales" } })],
      catalog: { products: [catalogProduct({ plans: [deprecatedPlan()] })] }
    });

    // Action
    const { deprecation } = set.toJSON().secrets;

    // Assert
    expect(deprecation).toMatchObject({
      kind: "plan",
      reason: "Your contract ends",
      nextSteps: "Talk to sales",
      date: BillingDate.longFromDate(sunset)
    });
  });

  test("should carry no deprecation when neither the product nor the plan is deprecated", () => {
    // Setup
    const set = build({ items: [item()], catalog: { products: [catalogProduct()] } });

    // Action
    const { deprecation } = set.toJSON().secrets;

    // Assert
    expect(deprecation).toBeUndefined();
  });
});

describe("EntitlementSet.build entitlements", () => {
  test("should list an entitlement-only product as entitled with its plan, as a paygo org has no subscription item", () => {
    // Setup
    const set = build({
      entitlementsRecord: entitlements({ products: [{ product_key: "pam", plan_key: "payg", status: "active" }] })
    });

    // Action
    const { pam } = set.toJSON();

    // Assert
    expect(pam).toMatchObject({ entitled: true, planTier: "payg", status: "active", isTrialing: false });
  });

  test("should keep a subscription item's own plan over the entitlement product's", () => {
    // Setup
    const set = build({
      items: [item({ plan: "advanced" })],
      entitlementsRecord: entitlements({ products: [{ product_key: "secrets", plan_key: "pro", status: "trialing" }] })
    });

    // Action
    const { secrets } = set.toJSON();

    // Assert
    expect(secrets.planTier).toBe("advanced");
  });

  test("should mark a product only a feature points at as entitled", () => {
    // Setup
    const set = build({
      entitlementsRecord: entitlements({ features: { sso: { value: true, from_product: "secrets" } } })
    });

    // Action
    const { secrets } = set.toJSON();

    // Assert
    expect(secrets).toEqual({ entitled: true });
  });
});

describe("EntitlementSet.activeProductCount", () => {
  test("should skip churned products", () => {
    // Setup
    const set = build({
      items: [item({ productId: "secrets", status: "active" }), item({ productId: "pam", status: "churned" })],
      entitlementsRecord: entitlements({ products: [{ product_key: "certs", status: "churned" }] })
    });

    // Action
    const count = set.activeProductCount();

    // Assert
    expect(count).toBe(1);
  });
});
