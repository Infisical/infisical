import { OUTBOX_BACKOFF_BASE_MS, RetryBackoff } from "./retry-backoff";

describe("RetryBackoff.delayMs", () => {
  test.each([
    [1, OUTBOX_BACKOFF_BASE_MS],
    [2, OUTBOX_BACKOFF_BASE_MS * 2],
    [4, OUTBOX_BACKOFF_BASE_MS * 8]
  ])("should wait at least the doubled base, plus bounded jitter, after attempt %s", (attempts, base) => {
    // Action
    const delay = RetryBackoff.delayMs(attempts);

    // Assert
    expect(delay).toBeGreaterThanOrEqual(base);
    expect(delay).toBeLessThan(base + 30_000);
  });
});

describe("RetryBackoff.delayAfter", () => {
  // Entries that share a delay settle in one statement.
  test("should give every entry on the same attempt of a batch the same delay", () => {
    // Setup
    const backoff = RetryBackoff.forBatch();

    // Action
    const delays = [backoff.delayAfter(3), backoff.delayAfter(3), backoff.delayAfter(3)];

    // Assert
    expect(new Set(delays).size).toBe(1);
  });
});
