import crypto from "node:crypto";

import { Knex } from "knex";

import { TableName, TEventOutbox } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";

import { OutboxClaim } from "../models/outbox-claim";
import { EventOutboxStatus, OutboxEntry } from "../models/outbox-entry";
import { TOldestPendingAge, TOutboxDelivery, TOutboxEntryStore } from "../services/dependencies";

// Postgres caps a statement at 65535 bind parameters and a row takes five, so a bulk write of ~13k+
// secrets would otherwise fail.
const INSERT_BATCH_SIZE = 1000;

// Every claim fills in eventId (see claimBatch). Only a row an old pod claimed can still lack one, and the
// sweeper, the one reader of such a row, never looks at it.
const toModel = (row: TEventOutbox) =>
  OutboxEntry.restore({
    id: String(row.id),
    consumer: row.consumer,
    eventId: row.eventId ?? "",
    eventType: row.eventType,
    payload: row.payload,
    occurredAt: new Date(row.occurredAt),
    status: row.status as EventOutboxStatus,
    attempts: row.attempts,
    lastError: row.lastError ?? null
  });

export class OutboxEntryStore implements TOutboxEntryStore {
  constructor(private readonly connection: TStoreConnection) {}

  async insert(deliveries: TOutboxDelivery[]): Promise<void> {
    if (deliveries.length === 0) return;
    try {
      for (const chunk of chunkArray(deliveries, INSERT_BATCH_SIZE)) {
        // eslint-disable-next-line no-await-in-loop -- one statement at a time on the caller's connection
        await this.connection
          .writer()(TableName.EventOutbox)
          .insert(
            chunk.map(({ consumer, event }) => ({
              consumer,
              eventId: event.id,
              eventType: event.type,
              payload: JSON.stringify(event.data),
              occurredAt: event.occurredAt
            }))
          )
          .onConflict(["consumer", "eventId"])
          .ignore();
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: insertEvents" });
    }
  }

  async findDueConsumers(consumers: string[], options?: TReadOptions): Promise<string[]> {
    if (consumers.length === 0) return [];
    try {
      const reader = this.connection.reader(options);
      const rows = await reader(TableName.EventOutbox)
        .whereIn("consumer", consumers)
        .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry])
        .andWhere("nextRetryAt", "<=", reader.fn.now())
        .groupBy("consumer")
        .select<{ consumer: string }[]>("consumer");

      return rows.map((row) => row.consumer);
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: findDueFlushKeys" });
    }
  }

  async findOldestPendingAgeSeconds(options?: TReadOptions): Promise<TOldestPendingAge[]> {
    try {
      const reader = this.connection.reader(options);
      const rows = await reader(TableName.EventOutbox)
        .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry, EventOutboxStatus.Processing])
        .groupBy("consumer")
        .select<{ consumer: string; ageSeconds: string }[]>(
          "consumer",
          reader.raw('EXTRACT(EPOCH FROM (NOW() - MIN("occurredAt")))::float8 as "ageSeconds"')
        );

      return rows.map((row) => ({
        consumer: row.consumer,
        ageSeconds: Number(row.ageSeconds)
      }));
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "EventOutbox: findOldestPendingAgeSeconds"
      });
    }
  }

  // One statement on purpose so the row locks only live as long as the UPDATE. The fresh lockToken is
  // how extendClaim and saveSettled tell this claim apart from a later one on the same rows. Old pods
  // write rows without an eventId during a rolling deploy, so the claim fills it in; consumers rely on
  // every event having one.
  async claimBatch(consumer: string, limit: number): Promise<OutboxClaim> {
    const lockToken = crypto.randomUUID();
    try {
      const writer = this.connection.writer();
      const claimed = await writer(TableName.EventOutbox)
        .whereIn("id", (qb) => {
          void qb
            .select("id")
            .from(TableName.EventOutbox)
            .where("consumer", consumer)
            .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry])
            .andWhere("nextRetryAt", "<=", writer.fn.now())
            .orderBy("id", "asc")
            .limit(limit)
            .forUpdate()
            .skipLocked();
        })
        .update({
          status: EventOutboxStatus.Processing,
          lockedAt: writer.fn.now(),
          lockToken,
          eventId: writer.raw('COALESCE("eventId", gen_random_uuid())')
        })
        .returning("*");

      // RETURNING order is arbitrary, and handle() is promised id order.
      const rows = (claimed as unknown as TEventOutbox[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return OutboxClaim.restore({ lockToken, entries: rows.map(toModel) });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: claimBatch" });
    }
  }

  // Keeps lockedAt fresh so the sweeper doesn't hand a slow batch to another worker mid-delivery.
  // Scoped to this claim's token so a late heartbeat can't refresh a lock someone else now holds.
  async extendClaim(claim: OutboxClaim): Promise<void> {
    if (claim.isEmpty) return;
    try {
      const writer = this.connection.writer();
      await writer(TableName.EventOutbox)
        .whereIn("id", claim.entryIds())
        .where("status", EventOutboxStatus.Processing)
        .where("lockToken", claim.lockToken)
        .update({ lockedAt: writer.fn.now() });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: extendClaims" });
    }
  }

  // The count comes up short when the sweeper recycled the claim mid-delivery and another worker now
  // owns the rows.
  async saveSettled(claim: OutboxClaim): Promise<number> {
    try {
      return await this.saveOutcomes(
        claim.entries,
        (query) => void query.where("status", EventOutboxStatus.Processing).where("lockToken", claim.lockToken)
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: commitResults" });
    }
  }

  async lockStaleClaims({ thresholdMs, limit }: { thresholdMs: number; limit: number }): Promise<OutboxEntry[]> {
    try {
      const rows = (await this.connection
        .writer()(TableName.EventOutbox)
        .where("status", EventOutboxStatus.Processing)
        .andWhereRaw(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [thresholdMs])
        .orderBy("lockedAt", "asc")
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .select("*")) as TEventOutbox[];

      return rows.map(toModel);
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "EventOutbox: recoverStaleClaims"
      });
    }
  }

  async saveExpired(entries: OutboxEntry[]): Promise<void> {
    try {
      await this.saveOutcomes(entries, () => {});
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "EventOutbox: recoverStaleClaims"
      });
    }
  }

  async deleteTerminalOlderThan(input: {
    deliveredBefore: Date;
    failedBefore: Date;
    batchSize: number;
  }): Promise<number> {
    try {
      return await this.connection
        .writer()(TableName.EventOutbox)
        .whereIn(
          "id",
          (qb) =>
            void qb
              .select("id")
              .from(TableName.EventOutbox)
              .where(
                (builder) =>
                  void builder
                    .where(
                      (delivered) =>
                        void delivered
                          .where("status", EventOutboxStatus.Delivered)
                          .andWhere("updatedAt", "<", input.deliveredBefore)
                    )
                    .orWhere(
                      (failed) =>
                        void failed
                          .where("status", EventOutboxStatus.Failed)
                          .andWhere("updatedAt", "<", input.failedBefore)
                    )
              )
              .limit(input.batchSize)
        )
        .del();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "EventOutbox: deleteTerminalOlderThan"
      });
    }
  }

  // One UPDATE per distinct outcome instead of one per row. The retry clock is computed in the database,
  // and `attempts` is incremented there, so a row the claim no longer holds is never overwritten.
  private async saveOutcomes(entries: OutboxEntry[], holding: (query: Knex.QueryBuilder) => void): Promise<number> {
    const groups = new Map<string, OutboxEntry[]>();
    for (const entry of entries) {
      const key = JSON.stringify([entry.status, entry.retryDelayMs, entry.lastError]);
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }

    const writer = this.connection.writer();
    let saved = 0;
    for (const group of groups.values()) {
      const [{ status, retryDelayMs, lastError }] = group;
      const query = writer(TableName.EventOutbox).whereIn(
        "id",
        group.map((entry) => entry.id)
      );
      holding(query);
      // eslint-disable-next-line no-await-in-loop -- one shared connection; writes are serial
      saved += await query.update({
        status,
        lastError,
        lockedAt: null,
        lockToken: null,
        ...(status === EventOutboxStatus.Delivered ? {} : { attempts: writer.raw('"attempts" + 1') }),
        ...(retryDelayMs === null
          ? {}
          : {
              nextRetryAt: writer.raw(`NOW() + (? || ' milliseconds')::INTERVAL`, [retryDelayMs])
            })
      });
    }
    return saved;
  }
}
