import { UsageMonth } from "./usage-month";

describe("UsageMonth", () => {
  test("should key a month by its UTC year and month", () => {
    // Action
    const keys = [
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-11-30T23:59:59Z"),
      new Date("2026-12-31T23:30:00-02:00")
    ].map((at) => UsageMonth.of(at).key);

    // Assert
    expect(keys).toEqual(["2026-01", "2026-11", "2027-01"]);
  });

  test("should reset on the first of next month, across the year end", () => {
    // Action
    const november = UsageMonth.of(new Date("2026-11-14T10:00:00Z")).resetsAt;
    const december = UsageMonth.of(new Date("2026-12-31T23:59:59Z")).resetsAt;

    // Assert
    expect(november.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(december.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("should count the seconds left until the reset", () => {
    // Setup
    const at = new Date("2026-12-31T23:59:00Z");

    // Action
    const seconds = UsageMonth.of(at).secondsUntilReset(at);

    // Assert
    expect(seconds).toBe(60);
  });
});
