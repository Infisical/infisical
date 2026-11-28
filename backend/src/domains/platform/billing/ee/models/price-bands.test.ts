import { PriceBands } from "./price-bands";

describe("PriceBands.fromTiers", () => {
  test("should be undefined when there are no tiers", () => {
    // Setup
    const tiers = [undefined, null, []];

    // Action
    const result = tiers.map((list) => PriceBands.fromTiers("volume", list));

    // Assert
    expect(result).toEqual([undefined, undefined, undefined]);
  });

  test("should read volume as volume and anything else as graduated", () => {
    // Setup
    const tiers = [{ upTo: null, unitAmountDecimal: "100" }];

    // Action
    const result = [
      PriceBands.fromTiers("volume", tiers)?.mode,
      PriceBands.fromTiers("graduated", tiers)?.mode,
      PriceBands.fromTiers(undefined, tiers)?.mode
    ];

    // Assert
    expect(result).toEqual(["volume", "graduated", "graduated"]);
  });

  test("should keep a sub-cent unit price in dollars and convert the flat fee from cents", () => {
    // Setup
    const tiers = [
      { upTo: 100, unitAmountDecimal: "0.5", flatAmountCents: 2000 },
      { upTo: null, unitAmountDecimal: "250" }
    ];

    // Action
    const result = PriceBands.fromTiers("graduated", tiers);

    // Assert
    expect(result?.tiers).toEqual([
      { upTo: 100, unitPrice: 0.005, flatFee: 20 },
      { upTo: null, unitPrice: 2.5, flatFee: 0 }
    ]);
  });
});
