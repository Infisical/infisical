import { RetryBackoff } from "./retry-backoff";

export enum EventOutboxStatus {
  Pending = "pending",
  Processing = "processing",
  Retry = "retry",
  Delivered = "delivered",
  Failed = "failed"
}

export enum EventResultStatus {
  Delivered = "delivered",
  Retry = "retry",
  Failed = "failed"
}

export const MAX_OUTBOX_ATTEMPTS = 8;

const NO_RESULT_ERROR = "Consumer returned no result for this event";
const STALE_CLAIM_ERROR = "Worker did not report a result before the claim went stale";

export type TOutboxEntryRecord = {
  id: string;
  consumer: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  status: EventOutboxStatus;
  attempts: number;
  lastError: string | null;
};

// One consumer's delivery of one event. No create(): the store inserts rows and a claim restores them.
export class OutboxEntry {
  private delayMs: number | null = null;

  private constructor(
    readonly id: string,
    readonly consumer: string,
    readonly eventId: string,
    readonly eventType: string,
    readonly payload: unknown,
    readonly occurredAt: Date,
    private currentStatus: EventOutboxStatus,
    private attemptsMade: number,
    private error: string | null
  ) {}

  static restore(record: TOutboxEntryRecord): OutboxEntry {
    return new OutboxEntry(
      record.id,
      record.consumer,
      record.eventId,
      record.eventType,
      record.payload,
      record.occurredAt,
      record.status,
      record.attempts,
      record.lastError
    );
  }

  get status(): EventOutboxStatus {
    return this.currentStatus;
  }

  get attempts(): number {
    return this.attemptsMade;
  }

  get lastError(): string | null {
    return this.error;
  }

  // Only set when the outcome is a retry.
  get retryDelayMs(): number | null {
    return this.delayMs;
  }

  // After this attempt the entry fails no matter what the consumer returns.
  isFinalAttempt(): boolean {
    return this.attemptsMade + 1 >= MAX_OUTBOX_ATTEMPTS;
  }

  // No result means retry, not delivered.
  settle(result: { status: EventResultStatus; error?: string } | undefined, backoff: RetryBackoff): void {
    const outcome = result ?? {
      status: EventResultStatus.Retry,
      error: NO_RESULT_ERROR
    };

    if (outcome.status === EventResultStatus.Delivered) {
      this.currentStatus = EventOutboxStatus.Delivered;
      this.error = null;
      this.delayMs = null;
      return;
    }
    this.recordFailedAttempt(outcome.status === EventResultStatus.Failed, outcome.error ?? null, backoff);
  }

  // The worker holding the claim never reported back.
  expireClaim(backoff: RetryBackoff): void {
    this.recordFailedAttempt(false, STALE_CLAIM_ERROR, backoff);
  }

  toJSON(): TOutboxEntryRecord {
    return {
      id: this.id,
      consumer: this.consumer,
      eventId: this.eventId,
      eventType: this.eventType,
      payload: this.payload,
      occurredAt: this.occurredAt,
      status: this.currentStatus,
      attempts: this.attemptsMade,
      lastError: this.error
    };
  }

  private recordFailedAttempt(terminal: boolean, error: string | null, backoff: RetryBackoff): void {
    const giveUp = terminal || this.isFinalAttempt();
    this.attemptsMade += 1;
    this.error = error;
    this.currentStatus = giveUp ? EventOutboxStatus.Failed : EventOutboxStatus.Retry;
    this.delayMs = giveUp ? null : backoff.delayAfter(this.attemptsMade);
  }
}
