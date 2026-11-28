import { Money } from "./money";

describe("Money.dollars", () => {
  test("should convert cents to dollars and read a missing amount as 0", () => {
    // Setup
    const inputs = [1999, 0, null, undefined];

    // Action
    const result = inputs.map((cents) => Money.dollars(cents));

    // Assert
    expect(result).toEqual([19.99, 0, 0, 0]);
  });
});

describe("Money.dollarsOrNull", () => {
  test("should keep not priced (null) apart from free (0)", () => {
    // Setup
    const inputs = [null, undefined, 0, 250];

    // Action
    const result = inputs.map((cents) => Money.dollarsOrNull(cents));

    // Assert
    expect(result).toEqual([null, null, 0, 2.5]);
  });
});
