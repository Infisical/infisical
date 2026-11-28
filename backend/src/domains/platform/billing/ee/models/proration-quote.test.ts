import { RuleViolationError } from "@app/domains/lib/errors";

import { ProrationQuote } from "./proration-quote";

const NOW = new Date("2026-11-27T12:00:00Z");
const nowSeconds = NOW.getTime() / 1000;
const STALE = "This quote is no longer current. Review the updated total and confirm again.";

describe("ProrationQuote.assertCurrent", () => {
  test("should accept a quote exactly 15 minutes old and one dated 60 seconds ahead", () => {
    // Setup
    const oldest = ProrationQuote.of(nowSeconds - 15 * 60);
    const newest = ProrationQuote.of(nowSeconds + 60);

    // Action
    const result = () => {
      oldest.assertCurrent(NOW);
      newest.assertCurrent(NOW);
    };

    // Assert
    expect(result).not.toThrow();
  });

  test("should refuse a quote 15 minutes and 1 second old", () => {
    // Setup
    const quote = ProrationQuote.of(nowSeconds - 15 * 60 - 1);

    // Action
    const result = () => quote.assertCurrent(NOW);

    // Assert
    expect(result).toThrow(RuleViolationError);
    expect(result).toThrow(STALE);
  });

  test("should refuse a quote dated 61 seconds ahead of the clock", () => {
    // Setup
    const quote = ProrationQuote.of(nowSeconds + 61);

    // Action
    const result = () => quote.assertCurrent(NOW);

    // Assert
    expect(result).toThrow(STALE);
  });

  test("should always accept a confirmation without a proration date", () => {
    // Setup
    const quote = ProrationQuote.of(undefined);

    // Action
    const result = () => quote.assertCurrent(NOW);

    // Assert
    expect(result).not.toThrow();
  });
});
