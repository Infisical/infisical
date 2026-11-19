import { z } from "zod";

import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

import { EmittedEvent, EventRejectionReason } from "../models/emitted-event";
import { OutboxClaim } from "../models/outbox-claim";
import { EventOutboxStatus, EventResultStatus, OutboxEntry } from "../models/outbox-entry";

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

// `id` is the event id, not the outbox row id.
export type TEventConsumerResult = {
  id: string;
  status: EventResultStatus;
  error?: string;
};

export type TEventConsumer<TData = unknown> = {
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
};

export type TOutboxDelivery = { consumer: string; event: EmittedEvent };

export type TOldestPendingAge = { consumer: string; ageSeconds: number };

export type TOutboxEntryStore = {
  // An event a consumer already has is dropped.
  insert(deliveries: TOutboxDelivery[]): Promise<void>;
  findDueConsumers(consumers: string[], options?: TReadOptions): Promise<string[]>;
  findOldestPendingAgeSeconds(options?: TReadOptions): Promise<TOldestPendingAge[]>;
  claimBatch(consumer: string, limit: number): Promise<OutboxClaim>;
  extendClaim(claim: OutboxClaim): Promise<void>;
  // Returns how many entries the claim still held. Needs a transaction: it is one statement per outcome.
  saveSettled(claim: OutboxClaim): Promise<number>;
  // Locks the rows until the transaction ends, so only call it inside one.
  lockStaleClaims(input: { thresholdMs: number; limit: number }): Promise<OutboxEntry[]>;
  saveExpired(entries: OutboxEntry[]): Promise<void>;
  deleteTerminalOlderThan(input: { deliveredBefore: Date; failedBefore: Date; batchSize: number }): Promise<number>;
};

// The outbox's own health, not what consumers do with events.
export type TEventsMetrics = {
  isEnabled(): boolean;
  recordRejected(params: { eventType: string; reason: EventRejectionReason; consumer?: string }): void;
  recordLag(params: { consumer: string; status: EventOutboxStatus; seconds: number }): void;
  recordExhausted(params: { consumer: string; count: number }): void;
  recordOldestPending(ages: TOldestPendingAge[]): void;
};

export type TEventsStores = {
  outboxEntryStore: TOutboxEntryStore;
  locks: TStoreLocks;
};
