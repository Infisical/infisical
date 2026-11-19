import { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS, OutboxEntry } from "./outbox-entry";
import { RetryBackoff } from "./retry-backoff";

const makeEntry = (attempts = 0) =>
  OutboxEntry.restore({
    id: "1",
    consumer: "alert",
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    eventType: "approval.workflow.request_opened",
    payload: { orgId: "org-1" },
    occurredAt: new Date("2026-08-20T17:42:31.000Z"),
    status: EventOutboxStatus.Processing,
    attempts,
    lastError: null
  });

describe("OutboxEntry.isFinalAttempt", () => {
  test("should be true only on the last attempt", () => {
    expect(makeEntry(MAX_OUTBOX_ATTEMPTS - 2).isFinalAttempt()).toBe(false);
    expect(makeEntry(MAX_OUTBOX_ATTEMPTS - 1).isFinalAttempt()).toBe(true);
  });
});

describe("OutboxEntry.settle", () => {
  test("should deliver without counting an attempt", () => {
    // Setup
    const entry = makeEntry(2);

    // Action
    entry.settle({ status: EventResultStatus.Delivered }, RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({ status: EventOutboxStatus.Delivered, attempts: 2, lastError: null });
    expect(entry.retryDelayMs).toBeNull();
  });

  test("should retry later, keeping the consumer's error, when the consumer asks to retry", () => {
    // Setup
    const entry = makeEntry();

    // Action
    entry.settle({ status: EventResultStatus.Retry, error: "slack 502" }, RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lastError: "slack 502" });
    expect(entry.retryDelayMs).toBeGreaterThanOrEqual(30_000);
  });

  // Otherwise entries the consumer forgot would sit in 'processing' until the sweeper noticed, looking
  // exactly like a crashed worker.
  test("should retry when the consumer returned no result", () => {
    // Setup
    const entry = makeEntry();

    // Action
    entry.settle(undefined, RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({
      status: EventOutboxStatus.Retry,
      lastError: "Consumer returned no result for this event"
    });
  });

  test("should fail for good when the consumer says the event can never be delivered", () => {
    // Setup
    const entry = makeEntry();

    // Action
    entry.settle({ status: EventResultStatus.Failed, error: "bad payload" }, RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({ status: EventOutboxStatus.Failed, attempts: 1, lastError: "bad payload" });
    expect(entry.retryDelayMs).toBeNull();
  });

  test("should fail for good when a retry is asked for on the last attempt", () => {
    // Setup
    const entry = makeEntry(MAX_OUTBOX_ATTEMPTS - 1);

    // Action
    entry.settle({ status: EventResultStatus.Retry }, RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({ status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS });
    expect(entry.retryDelayMs).toBeNull();
  });
});

describe("OutboxEntry.expireClaim", () => {
  // Backoff applies here too, otherwise a consumer that always hangs gets retried instantly.
  test("should back the entry off when it has attempts left", () => {
    // Setup
    const entry = makeEntry();

    // Action
    entry.expireClaim(RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({
      status: EventOutboxStatus.Retry,
      attempts: 1,
      lastError: "Worker did not report a result before the claim went stale"
    });
    expect(entry.retryDelayMs).toBeGreaterThanOrEqual(30_000);
  });

  test("should fail the entry when that was its last attempt", () => {
    // Setup
    const entry = makeEntry(MAX_OUTBOX_ATTEMPTS - 1);

    // Action
    entry.expireClaim(RetryBackoff.forBatch());

    // Assert
    expect(entry.toJSON()).toMatchObject({ status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS });
  });
});
