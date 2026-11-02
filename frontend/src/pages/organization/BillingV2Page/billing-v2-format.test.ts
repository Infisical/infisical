import { describe, expect, test } from "vitest";

import type { BillingV2EntitlementDim } from "@app/hooks/api";

import {
  bandRangeLabel,
  bandRateLabel,
  bandTableRate,
  meteredUsageCaption
} from "./billing-v2-format";

const bands = {
  mode: "graduated" as const,
  tiers: [
    { upTo: 10000, unitPrice: 0, flatFee: 0 },
    { upTo: 100000, unitPrice: 0.005, flatFee: 0 },
    { upTo: null, unitPrice: 0.003, flatFee: 0 }
  ]
};

describe("bandRateLabel", () => {
  test.each([
    ["a free band", { upTo: 10, unitPrice: 0, flatFee: 0 }, "free"],
    [
      "a sub-cent rate per 1,000",
      { upTo: null, unitPrice: 0.005, flatFee: 0 },
      "$5 per 1,000 minutes"
    ],
    ["a whole-cent rate per unit", { upTo: null, unitPrice: 0.25, flatFee: 0 }, "$0.25 per minute"],
    ["a flat fee only", { upTo: null, unitPrice: 0, flatFee: 50 }, "$50 flat"],
    ["a rate plus a flat fee", { upTo: null, unitPrice: 2, flatFee: 10 }, "$2 per minute + $10"]
  ])("%s", (_name, band, want) => {
    expect(bandRateLabel(band, "minute")).toBe(want);
  });
});

describe("bandTableRate", () => {
  test.each([
    ["a free band", { upTo: 10, unitPrice: 0, flatFee: 0 }, "Included"],
    ["a sub-cent rate per 1,000", { upTo: null, unitPrice: 0.005, flatFee: 0 }, "$5 per 1,000"],
    ["a whole-cent rate per unit", { upTo: null, unitPrice: 0.25, flatFee: 0 }, "$0.25 each"],
    ["a flat fee only", { upTo: null, unitPrice: 0, flatFee: 50 }, "$50 flat"],
    ["a rate plus a flat fee", { upTo: null, unitPrice: 0.003, flatFee: 10 }, "$3 per 1,000 + $10"]
  ])("%s", (_name, band, want) => {
    expect(bandTableRate(band)).toBe(want);
  });
});

describe("bandRangeLabel", () => {
  test("ranges start where the previous band ended", () => {
    expect(bandRangeLabel(bands, 0)).toBe("0 – 10,000");
    expect(bandRangeLabel(bands, 1)).toBe("10,001 – 100,000");
    expect(bandRangeLabel(bands, 2)).toBe("100,001+");
  });
});

describe("meteredUsageCaption", () => {
  const dim = (overrides: Partial<BillingV2EntitlementDim>): BillingV2EntitlementDim => ({
    key: "pam_session_minutes",
    label: "Session minutes",
    noun: "minute",
    unit: "minute",
    metered: true,
    cadence: "monthly",
    used: 150000,
    limit: null,
    committed: null,
    commitAvailable: false,
    onDemandAmount: 0,
    ...overrides
  });

  test("shows the estimate and the band the period is in", () => {
    const caption = meteredUsageCaption(
      dim({
        bands,
        usage: {
          periodStart: "Nov 1, 2026",
          periodEnd: "Nov 30, 2026",
          asOf: null,
          estimatedAmount: 600,
          currentTier: 2,
          nextTierAt: null,
          earlierInPeriod: []
        }
      })
    );
    expect(caption).toBe("≈ $600 so far · band 3: $3 per 1,000 minutes");
  });

  test("is empty for a dimension with no rated usage", () => {
    expect(meteredUsageCaption(dim({ usage: undefined }))).toBeNull();
    expect(meteredUsageCaption(dim({ metered: false }))).toBeNull();
  });
});
