import { BillingCadence } from "./billing-cadence";

describe("BillingCadence.orMonthly", () => {
  test("should read anything but annual as monthly", () => {
    // Setup
    const inputs = ["annual", "monthly", "", "weekly", null, undefined];

    // Action
    const result = inputs.map((input) => BillingCadence.orMonthly(input));

    // Assert
    expect(result).toEqual(["annual", "monthly", "monthly", "monthly", "monthly", "monthly"]);
  });
});

describe("BillingCadence.orNull", () => {
  test("should keep annual and monthly and read an empty or unknown cadence as null", () => {
    // Setup
    const inputs = ["annual", "monthly", "", "weekly", null, undefined];

    // Action
    const result = inputs.map((input) => BillingCadence.orNull(input));

    // Assert
    expect(result).toEqual(["annual", "monthly", null, null, null, null]);
  });
});
