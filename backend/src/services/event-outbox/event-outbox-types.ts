import { Knex } from "knex";
import RE2 from "re2";
import { z } from "zod";

export enum EventOutboxStatus {
  Pending = "pending",
  Processing = "processing",
  Retry = "retry",
  Delivered = "delivered",
  Failed = "failed"
}

export const MAX_OUTBOX_PAYLOAD_BYTES = 16 * 1024;

const MAX_OUTBOX_KEY_LENGTH = 255;

export const OUTBOX_RELAY_INTERVAL_MS = 10_000;

export const MAX_BATCHES_PER_FLUSH = 10;

export const OUTBOX_CLAIM_BATCH_SIZE = 100;

export const MAX_OUTBOX_ATTEMPTS = 8;

export const isFinalOutboxAttempt = (attemptsMade: number): boolean => attemptsMade + 1 >= MAX_OUTBOX_ATTEMPTS;

export const OUTBOX_BACKOFF_BASE_MS = 30_000;

export const computeBackoffMs = (attemptsAfterIncrement: number): number => {
  const exponent = Math.min(attemptsAfterIncrement - 1, 10);
  const base = OUTBOX_BACKOFF_BASE_MS * 2 ** exponent;
  const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
  return base + jitter;
};

export const STALE_CLAIM_THRESHOLD_MS = 10 * 60_000;

export const DELIVERED_RETENTION_MS = 24 * 60 * 60_000;
export const FAILED_RETENTION_MS = 30 * 24 * 60 * 60_000;

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_OUTBOX_KEY_LENGTH)
  .regex(
    new RE2(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    "Must be lowercase and dot-namespaced, e.g. 'pki.certificate.issued'"
  );

// `id` is set when the event is built, so every consumer's row for it shares the same one.
export const EventInputSchema = z.object({
  id: z.string().uuid(),
  type: keySchema,
  data: z.record(z.unknown()),
  time: z.date().optional()
});

export type TEventInput = z.input<typeof EventInputSchema>;

export type TEventEmitter = {
  emit: (events: TEventInput[], tx?: Knex) => Promise<void>;
};

// What a consumer sees: the CloudEvents 1.0 envelope, plus whether this is its last attempt. Lock and
// status columns stay inside the outbox.
export type TEvent<TData = unknown> = {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  time: string;
  data: TData;
  isFinalAttempt: boolean;
};

export enum EventResultStatus {
  Delivered = "delivered",
  Retry = "retry",
  Failed = "failed"
}

// `id` is the event id, not the outbox row id.
export type TEventConsumerResult = {
  id: string;
  status: EventResultStatus;
  error?: string;
};

export type TOutboxFlushKey = {
  consumer: string;
};

export interface IEventConsumer<TData = unknown> {
  // Stored on every row and part of the flush job id, so renaming it orphans in-flight rows.
  name: string;

  // Checked at emit. Don't make it `.strict()`: one event can feed several consumers, so each schema
  // has to tolerate fields it doesn't care about.
  dataSchema: z.ZodType<TData>;

  // Runs on the request path for every emit, so keep it pure and in-memory. Whether anyone actually
  // wants the event is decided later, in handle().
  subscribesTo(type: string): boolean;

  // Events arrive in the order they were written and one flush runs per consumer at a time, so a batch
  // is ordered but nothing is promised across flushes. Must return one result per event.
  handle(events: TEvent[]): Promise<TEventConsumerResult[]>;
}
