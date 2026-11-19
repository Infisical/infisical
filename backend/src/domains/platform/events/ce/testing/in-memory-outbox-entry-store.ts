import crypto from "node:crypto";

import { OutboxClaim } from "../models/outbox-claim";
import { EventOutboxStatus, OutboxEntry } from "../models/outbox-entry";
import { TOldestPendingAge, TOutboxDelivery, TOutboxEntryStore } from "../services/dependencies";

export type TInMemoryOutboxRow = {
  id: string;
  consumer: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  status: EventOutboxStatus;
  attempts: number;
  nextRetryAt: Date;
  lockedAt: Date | null;
  lockToken: string | null;
  lastError: string | null;
  updatedAt: Date;
};

const DUE = [EventOutboxStatus.Pending, EventOutboxStatus.Retry];

const toModel = (row: TInMemoryOutboxRow) =>
  OutboxEntry.restore({
    id: row.id,
    consumer: row.consumer,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: row.payload,
    occurredAt: row.occurredAt,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError
  });

const isDue = (row: TInMemoryOutboxRow) => DUE.includes(row.status) && row.nextRetryAt.getTime() <= Date.now();

const isHeldBy = (row: TInMemoryOutboxRow, lockToken: string) =>
  row.status === EventOutboxStatus.Processing && row.lockToken === lockToken;

// Reads the clock on every call, like NOW() in Postgres, so a test moves time with fake timers or patch().
export class InMemoryOutboxEntryStore implements TOutboxEntryStore {
  private rows: TInMemoryOutboxRow[] = [];

  private nextId = 1;

  async insert(deliveries: TOutboxDelivery[]): Promise<void> {
    const now = new Date();
    for (const { consumer, event } of deliveries) {
      if (!this.rows.some((row) => row.consumer === consumer && row.eventId === event.id)) {
        this.rows.push({
          id: String(this.nextId),
          consumer,
          eventId: event.id,
          eventType: event.type,
          payload: JSON.parse(JSON.stringify(event.data)) as unknown,
          occurredAt: event.occurredAt,
          status: EventOutboxStatus.Pending,
          attempts: 0,
          nextRetryAt: now,
          lockedAt: null,
          lockToken: null,
          lastError: null,
          updatedAt: now
        });
        this.nextId += 1;
      }
    }
  }

  async findDueConsumers(consumers: string[]): Promise<string[]> {
    const due = this.rows.filter((row) => consumers.includes(row.consumer) && isDue(row));
    return [...new Set(due.map((row) => row.consumer))];
  }

  async findOldestPendingAgeSeconds(): Promise<TOldestPendingAge[]> {
    const oldest = new Map<string, number>();
    for (const row of this.rows) {
      if ([...DUE, EventOutboxStatus.Processing].includes(row.status)) {
        const occurredAt = row.occurredAt.getTime();
        oldest.set(row.consumer, Math.min(oldest.get(row.consumer) ?? occurredAt, occurredAt));
      }
    }
    return [...oldest].map(([consumer, occurredAt]) => ({ consumer, ageSeconds: (Date.now() - occurredAt) / 1000 }));
  }

  async claimBatch(consumer: string, limit: number): Promise<OutboxClaim> {
    const lockToken = crypto.randomUUID();
    const claimed = this.rows.filter((row) => row.consumer === consumer && isDue(row)).slice(0, limit);
    const now = new Date();
    claimed.forEach((row) =>
      Object.assign(row, { status: EventOutboxStatus.Processing, lockedAt: now, lockToken, updatedAt: now })
    );
    return OutboxClaim.restore({ lockToken, entries: claimed.map(toModel) });
  }

  async extendClaim(claim: OutboxClaim): Promise<void> {
    const ids = claim.entryIds();
    this.rows
      .filter((row) => ids.includes(row.id) && isHeldBy(row, claim.lockToken))
      .forEach((row) => Object.assign(row, { lockedAt: new Date(), updatedAt: new Date() }));
  }

  async saveSettled(claim: OutboxClaim): Promise<number> {
    return this.saveOutcomes(claim.entries, (row) => isHeldBy(row, claim.lockToken));
  }

  async lockStaleClaims({ thresholdMs, limit }: { thresholdMs: number; limit: number }): Promise<OutboxEntry[]> {
    const cutoff = Date.now() - thresholdMs;
    return this.rows
      .filter((row) => row.status === EventOutboxStatus.Processing && (row.lockedAt?.getTime() ?? 0) < cutoff)
      .sort((a, b) => (a.lockedAt?.getTime() ?? 0) - (b.lockedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map(toModel);
  }

  async saveExpired(entries: OutboxEntry[]): Promise<void> {
    this.saveOutcomes(entries, () => true);
  }

  async deleteTerminalOlderThan(input: {
    deliveredBefore: Date;
    failedBefore: Date;
    batchSize: number;
  }): Promise<number> {
    const expired = this.rows
      .filter(
        (row) =>
          (row.status === EventOutboxStatus.Delivered && row.updatedAt < input.deliveredBefore) ||
          (row.status === EventOutboxStatus.Failed && row.updatedAt < input.failedBefore)
      )
      .slice(0, input.batchSize);
    this.rows = this.rows.filter((row) => !expired.includes(row));
    return expired.length;
  }

  // Copies, in id order. Change a row through patch().
  all(consumer?: string): TInMemoryOutboxRow[] {
    return this.rows.filter((row) => !consumer || row.consumer === consumer).map((row) => ({ ...row }));
  }

  patch(id: string, values: Partial<TInMemoryOutboxRow>): void {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) Object.assign(row, values);
  }

  // Makes every waiting row due now.
  elapseBackoff(): void {
    this.rows.forEach((row) => Object.assign(row, { nextRetryAt: new Date(0) }));
  }

  snapshot(): unknown {
    return { rows: this.rows.map((row) => ({ ...row })), nextId: this.nextId };
  }

  restore(snapshot: unknown): void {
    const { rows, nextId } = snapshot as { rows: TInMemoryOutboxRow[]; nextId: number };
    this.rows = rows.map((row) => ({ ...row }));
    this.nextId = nextId;
  }

  private saveOutcomes(entries: OutboxEntry[], holding: (row: TInMemoryOutboxRow) => boolean): number {
    const now = new Date();
    let saved = 0;
    for (const entry of entries) {
      const row = this.rows.find((candidate) => candidate.id === entry.id);
      if (row && holding(row)) {
        const retryDelayMs = entry.drawRetryDelayMs();
        Object.assign(row, {
          status: entry.status,
          lastError: entry.lastError,
          attempts: entry.attempts,
          lockedAt: null,
          lockToken: null,
          updatedAt: now,
          ...(retryDelayMs === null ? {} : { nextRetryAt: new Date(now.getTime() + retryDelayMs) })
        });
        saved += 1;
      }
    }
    return saved;
  }
}
