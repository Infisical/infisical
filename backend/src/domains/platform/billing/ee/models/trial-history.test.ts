import { BillingDate } from "./billing-date";
import { TrialHistory, TTrialsRecord } from "./trial-history";

const NOW = new Date("2026-11-27T12:00:00Z");
const nowSeconds = NOW.getTime() / 1000;

describe("TrialHistory.fromServer", () => {
  test("should map a trial with its end date and whole days since it ended", () => {
    // Setup
    const endedAt = nowSeconds - 3.5 * 24 * 60 * 60;
    const record: TTrialsRecord = {
      trials: [
        {
          product_key: "pam",
          plan_key: "pro",
          outcome: "expired",
          ended_reason: "payment_not_completed",
          ended_at: endedAt
        }
      ]
    };

    // Action
    const [trial] = TrialHistory.fromServer(record, NOW).toJSON();

    // Assert
    expect(trial).toEqual({
      productKey: "pam",
      planTier: "pro",
      basePlanTier: null,
      outcome: "expired",
      endedReason: "payment_not_completed",
      endedDetail: null,
      endedAt: BillingDate.long(endedAt),
      endedDaysAgo: 3
    });
  });

  test("should leave end details null for a trial still running", () => {
    // Setup
    const record: TTrialsRecord = { trials: [{ product_key: "pam", outcome: "trialing" }] };

    // Action
    const [trial] = TrialHistory.fromServer(record, NOW).toJSON();

    // Assert
    expect(trial).toMatchObject({ endedAt: null, endedDaysAgo: null });
  });
});

describe("TrialHistory.productKeys", () => {
  test("should list each product once even when it was trialled several times", () => {
    // Setup
    const record: TTrialsRecord = {
      trials: [
        { product_key: "pam", outcome: "expired" },
        { product_key: "secrets", outcome: "converted" },
        { product_key: "pam", outcome: "canceled" }
      ]
    };

    // Action
    const keys = TrialHistory.fromServer(record, NOW).productKeys();

    // Assert
    expect(keys).toEqual(["pam", "secrets"]);
  });

  test("should be empty for an org that never trialled", () => {
    // Setup
    const history = TrialHistory.empty();

    // Action
    const keys = history.productKeys();

    // Assert
    expect(keys).toEqual([]);
  });
});
