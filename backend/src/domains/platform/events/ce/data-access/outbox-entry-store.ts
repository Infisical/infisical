import crypto from "node:crypto";

import { Knex } from "knex";

import { TableName, TEventOutbox } from "@app/db/schemas";
import { TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray, groupBy } from "@app/lib/fn";

import { OutboxClaim } from "../models/outbox-claim";
import { EventOutboxStatus, OutboxEntry } from "../models/outbox-entry";
import { TOldestPendingAge, TOutboxDelivery, TOutboxEntryStore } from "../services/dependencies";

// Postgres caps a statement at 65535 bind params and a row takes five, so big bulk writes get chunked.
const INSERT_BATCH_SIZE = 1000;

const toModel = (row: TEventOutbox) =>
  OutboxEntry.restore({
    id: String(row.id),
    consumer: row.consumer,
    eventId: row.eventId,
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
      throw new DatabaseError({ error, name: "EventOutbox: insert" });
    }
  }

  async findDueConsumers(consumers: string[]): Promise<string[]> {
    if (consumers.length === 0) return [];
    try {
      const reader = this.connection.reader();
      const rows = await reader(TableName.EventOutbox)
        .whereIn("consumer", consumers)
        .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry])
        .andWhere("nextRetryAt", "<=", reader.fn.now())
        .groupBy("consumer")
        .select<{ consumer: string }[]>("consumer");

      return rows.map((row) => row.consumer);
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: findDueConsumers" });
    }
  }

  async findOldestPendingAgeSeconds(): Promise<TOldestPendingAge[]> {
    try {
      const reader = this.connection.reader();
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

  // One statement, so the row locks only last as long as the UPDATE. lockToken fences this claim from a later
  // one on the same rows.
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
          lockToken
        })
        .returning("*");

      // RETURNING order is arbitrary and handle() is promised id order.
      const rows = (claimed as unknown as TEventOutbox[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return OutboxClaim.restore({ lockToken, entries: rows.map(toModel) });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: claimBatch" });
    }
  }

  // Heartbeat, so the sweeper doesn't recycle a slow batch. Scoped to the token so a late one can't refresh
  // someone else's claim.
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
      throw new DatabaseError({ error, name: "EventOutbox: extendClaim" });
    }
  }

  // Comes up short when the sweeper recycled the claim mid-delivery.
  async saveSettled(claim: OutboxClaim): Promise<number> {
    try {
      return await this.saveOutcomes(
        claim.entries,
        (query) => void query.where("status", EventOutboxStatus.Processing).where("lockToken", claim.lockToken)
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: saveSettled" });
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
        name: "EventOutbox: lockStaleClaims"
      });
    }
  }

  async saveExpired(entries: OutboxEntry[]): Promise<void> {
    try {
      await this.saveOutcomes(entries, () => {});
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "EventOutbox: saveExpired"
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

  // One UPDATE per distinct outcome, so entries on the same attempt share one retry delay. The retry clock runs
  // in the database.
  private async saveOutcomes(entries: OutboxEntry[], holding: (query: Knex.QueryBuilder) => void): Promise<number> {
    const groups = groupBy(entries, (entry) => JSON.stringify([entry.status, entry.attempts, entry.lastError]));

    const writer = this.connection.writer();
    let saved = 0;
    for (const group of Object.values(groups)) {
      const [first] = group;
      const retryDelayMs = first.drawRetryDelayMs();
      const query = writer(TableName.EventOutbox).whereIn(
        "id",
        group.map((entry) => entry.id)
      );
      holding(query);
      // eslint-disable-next-line no-await-in-loop -- one shared connection; writes are serial
      saved += await query.update({
        status: first.status,
        lastError: first.lastError,
        attempts: first.attempts,
        lockedAt: null,
        lockToken: null,
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
