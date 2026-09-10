import RE2 from "re2";
import { z } from "zod";

import { TEventOutbox } from "@app/db/schemas";

export enum EventOutboxStatus {
  Pending = "pending",
  Processing = "processing",
  Retry = "retry",
  Delivered = "delivered",
  Failed = "failed"
}

export const MAX_OUTBOX_PAYLOAD_BYTES = 16 * 1024;

const MAX_OUTBOX_KEY_LENGTH = 255;

export const RELAY_DISCOVERY_LIMIT = 200;

export const OUTBOX_RELAY_INTERVAL_MS = 10_000;

export const MAX_BATCHES_PER_FLUSH = 10;

export const OUTBOX_CLAIM_BATCH_SIZE = 100;

export const MAX_OUTBOX_ATTEMPTS = 8;

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

export const OutboxEventSchema = z.object({
  eventType: keySchema,
  resourceType: keySchema,
  resourceId: z.string().trim().min(1).max(MAX_OUTBOX_KEY_LENGTH),
  orgId: z.string().uuid(),
  projectId: z.string().trim().min(1).max(MAX_OUTBOX_KEY_LENGTH).nullish(),
  payload: z.record(z.unknown()),
  idempotencyKey: z.string().trim().min(1).max(MAX_OUTBOX_KEY_LENGTH).optional(),
  occurredAt: z.date().optional()
});

export type TOutboxEvent = z.input<typeof OutboxEventSchema>;

export type TOutboxRowResult = {
  id: string;
  status: EventOutboxStatus.Delivered | EventOutboxStatus.Retry | EventOutboxStatus.Failed;
  error?: string;
  // Opaque to the outbox; handed back on the next attempt so a retry can skip what already landed.
  progress?: Record<string, unknown> | null;
};

export type TOutboxFlushKey = {
  consumer: string;
  resourceType: string;
  resourceId: string;
};

export interface IEventOutboxConsumer<TPayload = unknown> {
  // Stored on every row and part of the flush job id, so renaming it orphans in-flight rows.
  name: string;

  // Checked at emit. Don't make it `.strict()`: one event can feed several consumers, so each schema
  // has to tolerate fields it doesn't care about.
  payloadSchema: z.ZodType<TPayload>;

  // Runs on the request path for every emit, so keep it pure and in-memory. Whether anyone actually
  // wants the event is decided later, in handle().
  subscribesTo(eventType: string): boolean;

  // Rows for a single (resourceType, resourceId), in id order. Must return one result per row.
  handle(rows: TEventOutbox[]): Promise<TOutboxRowResult[]>;
}
