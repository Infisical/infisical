import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { computeBackoffMs, EventOutboxStatus, TEventOutboxRow, TOutboxFlushKey } from "./event-outbox-types";

export type TEventOutboxDALFactory = ReturnType<typeof eventOutboxDALFactory>;

export type TOutboxInsertRow = {
  consumer: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  orgId: string;
  projectId?: string | null;
  payload: unknown;
  idempotencyKey?: string | null;
  occurredAt: Date;
};

export const eventOutboxDALFactory = (db: TDbClient) => {
  const insertEvents = async (rows: TOutboxInsertRow[], tx: Knex): Promise<void> => {
    if (rows.length === 0) return;
    try {
      await tx(TableName.EventOutbox)
        .insert(
          rows.map((row) => ({
            ...row,
            payload: JSON.stringify(row.payload),
            projectId: row.projectId ?? null,
            idempotencyKey: row.idempotencyKey ?? null
          }))
        )
        .onConflict(db.raw('("consumer", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL'))
        .ignore();
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: insertEvents" });
    }
  };

  const findDueFlushKeys = async (limit: number, consumers: string[]): Promise<TOutboxFlushKey[]> => {
    if (consumers.length === 0) return [];
    try {
      const rows = await db
        .replicaNode()(TableName.EventOutbox)
        .whereIn("consumer", consumers)
        .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry])
        .andWhere("nextRetryAt", "<=", db.fn.now())
        .groupBy("consumer", "resourceType", "resourceId")
        .orderByRaw('MIN("nextRetryAt") ASC')
        .limit(limit)
        .select<TOutboxFlushKey[]>("consumer", "resourceType", "resourceId");

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: findDueFlushKeys" });
    }
  };

  // One statement, no explicit transaction: the row locks live only as long as the UPDATE, and a
  // claim costs one round trip instead of four.
  const claimBatch = async (key: TOutboxFlushKey, limit: number): Promise<TEventOutboxRow[]> => {
    try {
      const claimed = await db(TableName.EventOutbox)
        .whereIn("id", (qb) => {
          void qb
            .select("id")
            .from(TableName.EventOutbox)
            .where(key)
            .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry])
            .andWhere("nextRetryAt", "<=", db.fn.now())
            .orderBy("id", "asc")
            .limit(limit)
            .forUpdate()
            .skipLocked();
        })
        .update({ status: EventOutboxStatus.Processing, lockedAt: db.fn.now() })
        .returning("*");

      return (claimed as unknown as TEventOutboxRow[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: claimBatch" });
    }
  };

  // The sweeper reads a claim older than its threshold as a dead worker and hands the rows back out,
  // so a batch that legitimately runs that long has to keep lockedAt fresh or it delivers twice.
  const extendClaims = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    try {
      await db(TableName.EventOutbox)
        .whereIn("id", ids)
        .where("status", EventOutboxStatus.Processing)
        .update({ lockedAt: db.fn.now() });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: extendClaims" });
    }
  };

  const commitResults = async (input: {
    delivered: { ids: string[]; progress?: Record<string, unknown> | null }[];
    retriable: { ids: string[]; nextRetryDelayMs: number; progress?: Record<string, unknown> | null; error?: string }[];
    failed: { ids: string[]; error?: string }[];
  }): Promise<void> => {
    const total =
      input.delivered.reduce((n, g) => n + g.ids.length, 0) +
      input.retriable.reduce((n, g) => n + g.ids.length, 0) +
      input.failed.reduce((n, g) => n + g.ids.length, 0);
    if (total === 0) return;

    try {
      await db.transaction(async (tx) => {
        for (const group of input.delivered) {
          if (group.ids.length > 0) {
            // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes are serial
            await tx(TableName.EventOutbox)
              .whereIn("id", group.ids)
              .update({
                status: EventOutboxStatus.Delivered,
                lockedAt: null,
                lastError: null,
                ...(group.progress !== undefined ? { progress: JSON.stringify(group.progress) } : {})
              });
          }
        }

        for (const group of input.retriable) {
          if (group.ids.length > 0) {
            // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes are serial
            await tx(TableName.EventOutbox)
              .whereIn("id", group.ids)
              .update({
                status: EventOutboxStatus.Retry,
                attempts: db.raw('"attempts" + 1'),
                nextRetryAt: db.raw(`NOW() + (? || ' milliseconds')::INTERVAL`, [group.nextRetryDelayMs]),
                lockedAt: null,
                lastError: group.error ?? null,
                ...(group.progress !== undefined ? { progress: JSON.stringify(group.progress) } : {})
              });
          }
        }

        for (const group of input.failed) {
          if (group.ids.length > 0) {
            // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes are serial
            await tx(TableName.EventOutbox)
              .whereIn("id", group.ids)
              .update({
                status: EventOutboxStatus.Failed,
                attempts: db.raw('"attempts" + 1'),
                lockedAt: null,
                lastError: group.error ?? null
              });
          }
        }
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: commitResults" });
    }
  };

  const recoverStaleClaims = async (
    thresholdMs: number,
    maxAttempts: number
  ): Promise<{ retried: number; failed: number }> => {
    try {
      return await db.transaction(async (tx) => {
        const staleRows = await tx(TableName.EventOutbox)
          .where("status", EventOutboxStatus.Processing)
          .andWhereRaw(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [thresholdMs])
          .forUpdate()
          .skipLocked()
          .select<{ id: string; attempts: number }[]>("id", "attempts");

        if (staleRows.length === 0) return { retried: 0, failed: 0 };

        const exhausted = staleRows.filter((row) => row.attempts + 1 >= maxAttempts).map((row) => row.id);
        const retriable = staleRows.filter((row) => row.attempts + 1 < maxAttempts);

        const retriableByAttempt = new Map<number, string[]>();
        for (const row of retriable) {
          const ids = retriableByAttempt.get(row.attempts) ?? [];
          ids.push(row.id);
          retriableByAttempt.set(row.attempts, ids);
        }
        for (const [attempts, ids] of retriableByAttempt) {
          // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes are serial
          await tx(TableName.EventOutbox)
            .whereIn("id", ids)
            .update({
              status: EventOutboxStatus.Retry,
              attempts: db.raw('"attempts" + 1'),
              nextRetryAt: db.raw(`NOW() + (? || ' milliseconds')::INTERVAL`, [computeBackoffMs(attempts + 1)]),
              lockedAt: null,
              lastError: "Worker did not report a result before the claim went stale"
            });
        }

        if (exhausted.length > 0) {
          await tx(TableName.EventOutbox)
            .whereIn("id", exhausted)
            .update({
              status: EventOutboxStatus.Failed,
              attempts: db.raw('"attempts" + 1'),
              lockedAt: null,
              lastError: "Worker did not report a result before the claim went stale"
            });
        }

        return { retried: retriable.length, failed: exhausted.length };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: recoverStaleClaims" });
    }
  };

  const findOldestPendingAgeSeconds = async (): Promise<{ consumer: string; ageSeconds: number }[]> => {
    try {
      const rows = await db
        .replicaNode()(TableName.EventOutbox)
        .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry, EventOutboxStatus.Processing])
        .groupBy("consumer")
        .select<
          { consumer: string; ageSeconds: string }[]
        >("consumer", db.raw('EXTRACT(EPOCH FROM (NOW() - MIN("occurredAt")))::float8 as "ageSeconds"'));

      return rows.map((row) => ({ consumer: row.consumer, ageSeconds: Number(row.ageSeconds) }));
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: findOldestPendingAgeSeconds" });
    }
  };

  const deleteTerminalOlderThan = async (input: {
    deliveredBefore: Date;
    failedBefore: Date;
    batchSize: number;
  }): Promise<number> => {
    try {
      return await db(TableName.EventOutbox)
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
      throw new DatabaseError({ error, name: "EventOutbox: deleteTerminalOlderThan" });
    }
  };

  return {
    insertEvents,
    findDueFlushKeys,
    claimBatch,
    extendClaims,
    commitResults,
    recoverStaleClaims,
    findOldestPendingAgeSeconds,
    deleteTerminalOlderThan
  };
};
