import { TCatalogProduct } from "@app/domains/platform/license/ce/module";

import { BillingDate } from "./billing-date";
import { TCatalogPlanRecord } from "./catalog-plan";
import { CatalogProduct } from "./catalog-product";

const NOW = new Date("2026-11-27T12:00:00Z");

const planRecord = (overrides: Partial<TCatalogPlanRecord> = {}): TCatalogPlanRecord => ({
  tier: "pro",
  name: "Pro",
  selfServe: true,
  salesLed: false,
  trialable: false,
  upgradeable: false,
  deprecated: false,
  prices: [{ dimensionKey: "identities", cadence: "monthly", kind: "per_unit", unitAmountCents: 500 }],
  ...overrides
});

const productRecord = (overrides: Partial<TCatalogProduct> = {}): TCatalogProduct => ({
  id: "secrets",
  name: "Secrets",
  addon: false,
  deprecated: false,
  dimensions: [{ key: "identities", label: "Identities", noun: "identity" }],
  plans: [
    planRecord({ tier: "free", name: "Free", prices: [] }),
    planRecord(),
    planRecord({ tier: "enterprise", name: "Enterprise", selfServe: false, salesLed: true, prices: [] })
  ],
  comparison: [],
  includes: [],
  ...overrides
});

describe("CatalogProduct.selfServePlan", () => {
  test("should pick the paid self-serve plan, never the free or an unpriced one", () => {
    // Setup
    const product = CatalogProduct.restore(
      productRecord({
        plans: [
          planRecord({ tier: "free", name: "Free", prices: [] }),
          planRecord({ tier: "starter", name: "Starter", prices: [] }),
          planRecord({ tier: "pro" })
        ]
      })
    );

    // Action
    const plan = product.selfServePlan();

    // Assert
    expect(plan?.tier).toBe("pro");
  });

  test("should return null for a tier that is not self-serve, and for a product with no paid self-serve plan", () => {
    // Setup
    const product = CatalogProduct.restore(productRecord());
    const salesOnly = CatalogProduct.restore(
      productRecord({ plans: [planRecord({ tier: "enterprise", selfServe: false })] })
    );

    // Action
    const result = [product.selfServePlan("enterprise"), salesOnly.selfServePlan()];

    // Assert
    expect(result).toEqual([null, null]);
  });
});

describe("CatalogProduct.findIn", () => {
  test("should find a product by id and be null for an unknown id or a missing catalog", () => {
    // Setup
    const catalog = { products: [productRecord()] };

    // Action
    const result = [
      CatalogProduct.findIn(catalog, "secrets")?.id,
      CatalogProduct.findIn(catalog, "pam"),
      CatalogProduct.findIn(null, "secrets")
    ];

    // Assert
    expect(result).toEqual(["secrets", null, null]);
  });
});

describe("CatalogProduct.toView", () => {
  test("should list paid self-serve and sales-led plans but never the free tier", () => {
    // Setup
    const product = CatalogProduct.restore(productRecord());

    // Action
    const view = product.toView(NOW);

    // Assert
    expect(view.plans.map((plan) => plan.tier)).toEqual(["pro", "enterprise"]);
  });

  test("should fall back to a generic icon and colour when the catalog omits them", () => {
    // Setup
    const product = CatalogProduct.restore(productRecord({ icon: undefined, color: "" }));

    // Action
    const view = product.toView(NOW);

    // Assert
    expect(view).toMatchObject({ icon: "box", color: "#6b7280" });
  });

  test("should key comparison cells by tier so the page renders a column per plan", () => {
    // Setup
    const product = CatalogProduct.restore(
      productRecord({
        comparison: [
          {
            label: "SSO",
            cells: [
              { tier: "pro", value: false },
              { tier: "enterprise", value: true }
            ]
          }
        ]
      })
    );

    // Action
    const { compare } = product.toView(NOW);

    // Assert
    expect(compare).toEqual([{ label: "SSO", cells: { pro: false, enterprise: true } }]);
  });

  test("should give a deprecated product its formatted sunset date and days left", () => {
    // Setup
    const sunset = new Date("2026-12-07T12:00:00Z");
    const product = CatalogProduct.restore(
      productRecord({ deprecated: true, deprecationReason: "Discontinued", deprecationDate: sunset.toISOString() })
    );

    // Action
    const view = product.toView(NOW);

    // Assert
    expect(view.deprecated).toBe(true);
    expect(view.deprecation).toEqual({
      reason: "Discontinued",
      nextSteps: undefined,
      date: BillingDate.longFromDate(sunset),
      daysLeft: 10
    });
  });

  test("should carry no deprecation for a product that is not deprecated", () => {
    // Setup
    const product = CatalogProduct.restore(productRecord());

    // Action
    const view = product.toView(NOW);

    // Assert
    expect(view.deprecation).toBeUndefined();
  });
});
