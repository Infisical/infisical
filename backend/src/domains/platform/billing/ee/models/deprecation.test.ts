import { BillingDate } from "./billing-date";
import { Deprecation } from "./deprecation";

const NOW = new Date("2026-11-27T12:00:00Z");
const sunset = new Date("2026-12-27T12:00:00Z");

describe("Deprecation.from", () => {
  test("should be undefined when nothing is deprecated", () => {
    // Setup
    const input = { deprecated: false, reason: "old", date: sunset.getTime() };

    // Action
    const result = Deprecation.from(input, NOW);

    // Assert
    expect(result).toBeUndefined();
  });

  test.each([
    ["unix seconds", sunset.getTime() / 1000],
    ["milliseconds", sunset.getTime()],
    ["an ISO string", sunset.toISOString()]
  ])("should format the sunset date and count 30 days left when the date is %s", (_label, date) => {
    // Setup
    const input = { deprecated: true, reason: "Discontinued", nextSteps: "Move to Pro", date };

    // Action
    const result = Deprecation.from(input, NOW);

    // Assert
    expect(result).toEqual({
      reason: "Discontinued",
      nextSteps: "Move to Pro",
      date: BillingDate.longFromDate(sunset),
      daysLeft: 30
    });
  });

  test("should have no date or days left when none was given, and never count negative days after sunset", () => {
    // Setup
    const undated = { deprecated: true };
    const past = { deprecated: true, date: new Date("2026-01-01T00:00:00Z").toISOString() };

    // Action
    const result = [Deprecation.from(undated, NOW), Deprecation.from(past, NOW)];

    // Assert
    expect(result).toEqual([
      { reason: undefined, nextSteps: undefined, date: null, daysLeft: null },
      expect.objectContaining({ daysLeft: 0 })
    ]);
  });
});
