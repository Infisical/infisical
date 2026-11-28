import { BillingDate } from "./billing-date";
import { CatalogPlan, TCatalogPlanRecord, TCatalogPrice } from "./catalog-plan";

const NOW = new Date("2026-11-27T12:00:00Z");

const dimensions = [
  { key: "identities", label: "Machine identities", noun: "identity", billingType: "per_resource" },
  { key: "requests", label: "Requests", noun: "request", billingType: "metered", aggregation: "sum" }
];

const price = (overrides: Partial<TCatalogPrice> = {}): TCatalogPrice => ({
  dimensionKey: "identities",
  cadence: "monthly",
  kind: "per_unit",
  unitAmountCents: 500,
  ...overrides
});

const planRecord = (overrides: Partial<TCatalogPlanRecord> = {}): TCatalogPlanRecord => ({
  tier: "pro",
  name: "Pro",
  selfServe: true,
  salesLed: false,
  trialable: false,
  upgradeable: false,
  deprecated: false,
  prices: [price()],
  ...overrides
});

const plan = (overrides: Partial<TCatalogPlanRecord> = {}) => CatalogPlan.restore(planRecord(overrides), dimensions);

describe("CatalogPlan.perUnitPrices", () => {
  test("should never sell a metered dimension's price per unit, whether its kind is omitted or per_unit", () => {
    // Setup
    const subject = plan({
      prices: [
        price({ dimensionKey: "requests", kind: "per_unit" }),
        price({ dimensionKey: "requests", kind: "" }),
        price({ dimensionKey: "identities" })
      ]
    });

    // Action
    const sold = subject.perUnitPrices("monthly");

    // Assert
    expect(sold.map((entry) => entry.dimensionKey)).toEqual(["identities"]);
  });

  test("should never sell a price with an unknown kind", () => {
    // Setup
    const subject = plan({ prices: [price({ kind: "tiered_flat" })] });

    // Action
    const sold = subject.perUnitPrices("monthly");

    // Assert
    expect(sold).toEqual([]);
  });
});

describe("CatalogPlan.isPaidSelfServe", () => {
  test("should sell a plan with only a base fee, and not one with only an unknown kind", () => {
    // Setup
    const baseOnly = plan({ prices: [], basePriceMonthlyCents: 9900 });
    const unknownOnly = plan({ prices: [price({ kind: "mystery" })] });

    // Action
    const result = [baseOnly.isPaidSelfServe(), unknownOnly.isPaidSelfServe()];

    // Assert
    expect(result).toEqual([true, false]);
  });
});

describe("CatalogPlan.sellsAt", () => {
  test("should be false for a cadence with neither a price nor a base fee", () => {
    // Setup
    const subject = plan({ prices: [price({ cadence: "monthly" })] });

    // Action
    const result = [subject.sellsAt("monthly"), subject.sellsAt("annual")];

    // Assert
    expect(result).toEqual([true, false]);
  });

  test("should be true for a cadence that only has a base fee", () => {
    // Setup
    const subject = plan({ prices: [], basePriceAnnualCents: 100000 });

    // Action
    const result = [subject.sellsAt("annual"), subject.sellsAt("monthly")];

    // Assert
    expect(result).toEqual([true, false]);
  });
});

describe("CatalogPlan.toView", () => {
  test("should flag a metered dimension per cadence, so one priced per unit monthly and metered annually is not mislabelled", () => {
    // Setup
    const subject = plan({
      prices: [
        price({ dimensionKey: "identities", cadence: "monthly", kind: "per_unit" }),
        price({ dimensionKey: "identities", cadence: "annual", kind: "metered" }),
        price({ dimensionKey: "requests", cadence: "monthly", kind: "per_unit", unitAmountCents: 2 })
      ]
    });

    // Action
    const { dims } = subject.toView(NOW);

    // Assert
    expect(dims.find((dim) => dim.key === "identities")).toMatchObject({ meteredMonthly: false, meteredAnnual: true });
    expect(dims.find((dim) => dim.key === "requests")).toMatchObject({ meteredMonthly: true, aggregation: "sum" });
  });

  test("should omit a price with an unknown kind from the dimensions", () => {
    // Setup
    const subject = plan({ prices: [price({ kind: "mystery" })] });

    // Action
    const { dims } = subject.toView(NOW);

    // Assert
    expect(dims).toEqual([]);
  });

  test("should take price bands from the monthly price only", () => {
    // Setup
    const tiers = [{ upTo: null, unitAmountDecimal: "10", flatAmountCents: 0 }];
    const subject = plan({
      prices: [
        price({ dimensionKey: "requests", cadence: "annual", kind: "metered", tiersMode: "volume", tiers }),
        price({ dimensionKey: "identities", cadence: "monthly", tiersMode: "volume", tiers })
      ]
    });

    // Action
    const { dims } = subject.toView(NOW);

    // Assert
    expect(dims.find((dim) => dim.key === "requests")?.bands).toBeUndefined();
    expect(dims.find((dim) => dim.key === "identities")?.bands).toEqual({
      mode: "volume",
      tiers: [{ upTo: null, unitPrice: 0.1, flatFee: 0 }]
    });
  });

  test("should show the base fee in dollars, and none when the plan has no base fee", () => {
    // Setup
    const withBase = plan({ basePriceMonthlyCents: 9900 });
    const without = plan();

    // Action
    const result = [withBase.toView(NOW).base, without.toView(NOW).base];

    // Assert
    expect(result).toEqual([{ monthly: 99, annual: 0 }, undefined]);
  });

  test("should give a deprecated plan its formatted sunset date and days left", () => {
    // Setup
    const sunset = new Date("2026-12-27T12:00:00Z");
    const subject = plan({
      deprecated: true,
      deprecationReason: "Retired",
      deprecationNextSteps: "Move to Advanced",
      deprecationDate: sunset.getTime() / 1000
    });

    // Action
    const view = subject.toView(NOW);

    // Assert
    expect(view.deprecation).toEqual({
      reason: "Retired",
      nextSteps: "Move to Advanced",
      date: BillingDate.longFromDate(sunset),
      daysLeft: 30
    });
  });
});
