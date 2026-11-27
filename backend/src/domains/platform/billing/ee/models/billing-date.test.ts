import { BillingDate } from "./billing-date";

const NOW = new Date("2026-11-27T12:00:00Z");
const DAY_SECONDS = 24 * 60 * 60;
const nowSeconds = NOW.getTime() / 1000;

describe("BillingDate.long and BillingDate.short", () => {
  test("should format unix seconds the way the pages show them, and null for an absent date", () => {
    // Setup
    const date = new Date("2026-08-16T12:00:00Z");

    // Action
    const result = [
      BillingDate.long(date.getTime() / 1000),
      BillingDate.short(date.getTime() / 1000),
      BillingDate.long(null),
      BillingDate.short(0)
    ];

    // Assert
    expect(result).toEqual([
      date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      null,
      null
    ]);
  });
});

describe("BillingDate.longFromIso", () => {
  test("should be null for an empty or unparseable value", () => {
    // Setup
    const inputs = [null, undefined, "", "not a date"];

    // Action
    const result = inputs.map((input) => BillingDate.longFromIso(input));

    // Assert
    expect(result).toEqual([null, null, null, null]);
  });
});

describe("BillingDate.daysUntil", () => {
  test("should round partial days up and never go negative", () => {
    // Setup
    const inAdayAndAbit = nowSeconds + DAY_SECONDS + 1;
    const inThePast = nowSeconds - 5 * DAY_SECONDS;

    // Action
    const result = [BillingDate.daysUntil(inAdayAndAbit, NOW), BillingDate.daysUntil(inThePast, NOW)];

    // Assert
    expect(result).toEqual([2, 0]);
  });
});

describe("BillingDate.daysSince", () => {
  test("should round partial days down and never go negative", () => {
    // Setup
    const aDayAndAHalfAgo = nowSeconds - 1.5 * DAY_SECONDS;
    const inTheFuture = nowSeconds + DAY_SECONDS;

    // Action
    const result = [BillingDate.daysSince(aDayAndAHalfAgo, NOW), BillingDate.daysSince(inTheFuture, NOW)];

    // Assert
    expect(result).toEqual([1, 0]);
  });
});

describe("BillingDate.parseFlexible", () => {
  test("should read seconds, milliseconds and ISO strings as the same instant", () => {
    // Setup
    const instant = new Date("2026-12-25T00:00:00Z");

    // Action
    const result = [
      BillingDate.parseFlexible(instant.getTime() / 1000)?.getTime(),
      BillingDate.parseFlexible(instant.getTime())?.getTime(),
      BillingDate.parseFlexible(instant.toISOString())?.getTime()
    ];

    // Assert
    expect(result).toEqual([instant.getTime(), instant.getTime(), instant.getTime()]);
  });

  test("should be null for an absent or unparseable value", () => {
    // Setup
    const inputs = [null, undefined, "garbage"];

    // Action
    const result = inputs.map((input) => BillingDate.parseFlexible(input));

    // Assert
    expect(result).toEqual([null, null, null]);
  });
});
