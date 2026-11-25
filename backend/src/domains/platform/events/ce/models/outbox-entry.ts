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

export const OUTBOX_BACKOFF_BASE_MS = 30_000;

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

  // After this attempt the entry fails no matter what the consumer returns.
  isFinalAttempt(): boolean {
    return this.attemptsMade + 1 >= MAX_OUTBOX_ATTEMPTS;
  }

  // No result means retry, not delivered.
  settle(result: { status: EventResultStatus; error?: string } | undefined): void {
    const outcome = result ?? {
      status: EventResultStatus.Retry,
      error: NO_RESULT_ERROR
    };

    if (outcome.status === EventResultStatus.Delivered) {
      this.currentStatus = EventOutboxStatus.Delivered;
      this.error = null;
      return;
    }
    this.recordFailedAttempt(outcome.status === EventResultStatus.Failed, outcome.error ?? null);
  }

  // The worker holding the claim never reported back.
  expireClaim(): void {
    this.recordFailedAttempt(false, STALE_CLAIM_ERROR);
  }

  // How long to wait before the next attempt, null unless the entry is waiting on a retry. Exponential with
  // jitter, so every call gives a different delay.
  drawRetryDelayMs(): number | null {
    if (this.currentStatus !== EventOutboxStatus.Retry) return null;
    const exponent = Math.min(this.attemptsMade - 1, 10);
    const base = OUTBOX_BACKOFF_BASE_MS * 2 ** exponent;
    const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
    return base + jitter;
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

  private recordFailedAttempt(terminal: boolean, error: string | null): void {
    const giveUp = terminal || this.isFinalAttempt();
    this.attemptsMade += 1;
    this.error = error;
    this.currentStatus = giveUp ? EventOutboxStatus.Failed : EventOutboxStatus.Retry;
  }
}
