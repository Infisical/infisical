import { describe, expect, test } from "vitest";

import { catalogResponseSchema, subscriptionResponseSchema } from "./license-client-types";

const meteredDimension = {
  key: "pam_session_minutes",
  metered: true,
  aggregation: "sum",
  used: 150000,
  usage: {
    periodStart: 1793491200,
    periodEnd: 1796083200,
    asOf: 1795900000,
    estimatedAmountCents: 60000,
    currentTier: 2,
    nextTierAt: null,
    byTier: [
      { quantity: 10000, amountCents: 0 },
      { quantity: 90000, amountCents: 45000 },
      { quantity: 50000, amountCents: 15000 }
    ],
    earlierInPeriod: []
  },
  pricing: {
    tiersMode: "graduated",
    tiers: [
      { upTo: 10000, unitAmountDecimal: "0", flatAmountCents: 0 },
      { upTo: 100000, unitAmountDecimal: "0.5", flatAmountCents: 0 },
      { upTo: null, unitAmountDecimal: "0.3", flatAmountCents: 0 }
    ]
  }
};

describe("subscriptionResponseSchema metered fields", () => {
  test("parses a metered dimension's rated usage, pinned bands and the billing estimate", () => {
    const parsed = subscriptionResponseSchema.parse({
      status: "active",
      items: [{ productId: "pam", plan: "pro", dimensions: [meteredDimension] }],
      billing: {
        monthlyRecurringCents: 1000,
        nextChargeAt: 1796083200,
        estimatedUsageCents: 60000,
        lines: [
          {
            productKey: "pam",
            dimensionKey: "pam_session_minutes",
            usageBased: true,
            quantity: 0,
            usageQuantity: 150000,
            estimatedAmountCents: 60000
          }
        ]
      }
    });

    const dimension = parsed.items[0].dimensions[0];
    expect(dimension.usage?.estimatedAmountCents).toBe(60000);
    expect(dimension.usage?.currentTier).toBe(2);
    expect(dimension.usage?.trial).toBe(false);
    expect(dimension.pricing?.tiers[1].unitAmountDecimal).toBe("0.5");
    expect(dimension.pricing?.tiers[2].upTo).toBeNull();
    expect(parsed.billing?.estimatedUsageCents).toBe(60000);
    expect(parsed.billing?.lines[0].usageQuantity).toBe(150000);
  });

  test("still parses a server that sends none of the metered fields", () => {
    const parsed = subscriptionResponseSchema.parse({
      status: "active",
      items: [{ productId: "pam", plan: "pro", dimensions: [{ key: "identities", used: 12 }] }],
      billing: { lines: [{ productKey: "pam", usageBased: false }] }
    });

    expect(parsed.items[0].dimensions[0].usage).toBeUndefined();
    expect(parsed.items[0].dimensions[0].pricing).toBeUndefined();
    expect(parsed.billing?.estimatedUsageCents).toBeUndefined();
  });

  test("tolerates nulls in the metered fields instead of failing the whole subscription", () => {
    const parsed = subscriptionResponseSchema.parse({
      status: "active",
      items: [
        {
          productId: "pam",
          plan: "pro",
          dimensions: [
            {
              key: "pam_session_minutes",
              metered: true,
              usage: { periodStart: null, periodEnd: 1796083200 },
              pricing: { tiersMode: "graduated", tiers: [] }
            },
            {
              key: "pam_recordings",
              metered: true,
              usage: { periodStart: 1793491200, periodEnd: 1796083200, currentTier: null },
              pricing: {
                tiersMode: "graduated",
                tiers: [
                  { upTo: 100, unitAmountDecimal: "1", flatAmountCents: null },
                  { unitAmountDecimal: null, flatAmountCents: 500 }
                ]
              }
            }
          ]
        }
      ]
    });

    const [broken, nulls] = parsed.items[0].dimensions;
    expect(broken.usage, "a malformed usage block is dropped").toBeUndefined();
    expect(nulls.usage?.currentTier).toBe(0);
    expect(nulls.pricing?.tiers).toEqual([
      expect.objectContaining({ upTo: 100, unitAmountDecimal: "1", flatAmountCents: 0 }),
      expect.objectContaining({ upTo: null, unitAmountDecimal: "0", flatAmountCents: 500 })
    ]);
  });
});

describe("catalogResponseSchema metered fields", () => {
  test("carries a dimension's billing type and a price's bands", () => {
    const parsed = catalogResponseSchema.parse({
      products: [
        {
          id: "pam",
          name: "PAM",
          addon: false,
          dimensions: [
            {
              key: "pam_session_minutes",
              label: "Session minutes",
              noun: "minute",
              billingType: "metered",
              aggregation: "sum"
            },
            { key: "identities", label: "Identities", noun: "identity", billingType: null }
          ],
          plans: [
            {
              tier: "pro",
              name: "Pro",
              selfServe: true,
              salesLed: false,
              prices: [
                {
                  dimensionKey: "pam_session_minutes",
                  cadence: "monthly",
                  unitAmountCents: 1,
                  tiersMode: "volume",
                  tiers: [{ upTo: null, unitAmountDecimal: "0.3" }]
                }
              ]
            }
          ],
          comparison: [],
          includes: []
        }
      ]
    });

    const product = parsed.products[0];
    expect(product.dimensions[0].billingType).toBe("metered");
    expect(product.plans[0].prices[0].tiersMode).toBe("volume");
    expect(product.plans[0].prices[0].tiers?.[0].flatAmountCents).toBe(0);
  });
});
