import { ProductLineItem } from "./product-line-item";

const counted = [
  { dimensionKey: "committed", present: 40, included: 5 },
  { dimensionKey: "present", present: 12, included: 5 },
  { dimensionKey: "unmetered", present: null, included: 5 }
];

describe("ProductLineItem.fromUsage", () => {
  test("should price an annual line at the commitment, else the present count, else the included floor", () => {
    // Setup
    const input = { planTier: "pro", cadence: "annual" as const, counted, committed: { committed: 100 } };

    // Action
    const item = ProductLineItem.fromUsage(input);

    // Assert
    expect(item.quantities).toEqual({ committed: 100, present: 12, unmetered: 5 });
  });

  test("should send no quantities on a monthly line", () => {
    // Setup
    const input = { planTier: "pro", cadence: "monthly" as const, counted, committed: { committed: 100 } };

    // Action
    const item = ProductLineItem.fromUsage(input);

    // Assert
    expect(item.quantities).toBeUndefined();
  });

  test("should declare only metered dimensions' present usage and never the commitment", () => {
    // Setup
    const input = { planTier: "pro", cadence: "annual" as const, counted, committed: { committed: 100 } };

    // Action
    const item = ProductLineItem.fromUsage(input);

    // Assert
    expect(item.declaredUsage).toEqual({ committed: 40, present: 12 });
  });
});
