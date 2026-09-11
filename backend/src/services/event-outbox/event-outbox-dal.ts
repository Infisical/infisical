import crypto from "node:crypto";

import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TEventOutbox } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { computeBackoffMs, EventOutboxStatus, TOutboxFlushKey } from "./event-outbox-types";

export type TEventOutboxDALFactory = ReturnType<typeof eventOutboxDALFactory>;

export type TOutboxClaim = {
  lockToken: string;
  rows: TEventOutbox[];
};

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

  // One statement on purpose: the row locks live only as long as the UPDATE. The claim also stamps a
  // fresh lockToken, which is what lets extendClaims and commitResults tell this claim apart from a
  // later one over the same rows.
  const claimBatch = async (key: TOutboxFlushKey, limit: number): Promise<TOutboxClaim> => {
    const lockToken = crypto.randomUUID();
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
        .update({ status: EventOutboxStatus.Processing, lockedAt: db.fn.now(), lockToken })
        .returning("*");

      // RETURNING order is arbitrary, and handle() is promised id order.
      const rows = (claimed as unknown as TEventOutbox[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      return { lockToken, rows };
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: claimBatch" });
    }
  };

  // A batch that outlives the stale threshold has to keep lockedAt fresh or the sweeper hands its rows
  // to another worker mid-delivery. Scoped to the caller's own claim, so a heartbeat that comes back
  // after the sweeper recycled these rows can't refresh the new owner's lock.
  const extendClaims = async (ids: string[], lockToken: string): Promise<void> => {
    if (ids.length === 0) return;
    try {
      await db(TableName.EventOutbox)
        .whereIn("id", ids)
        .where("status", EventOutboxStatus.Processing)
        .where("lockToken", lockToken)
        .update({ lockedAt: db.fn.now() });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: extendClaims" });
    }
  };

  // Returns how many rows were settled, which is short of what the caller claimed when the claim was
  // recycled mid-delivery and the rows now belong to another worker.
  const commitResults = async (input: {
    lockToken: string;
    delivered: { ids: string[]; progress?: Record<string, unknown> | null }[];
    retriable: { ids: string[]; nextRetryDelayMs: number; progress?: Record<string, unknown> | null; error?: string }[];
    failed: { ids: string[]; error?: string }[];
  }): Promise<number> => {
    const total =
      input.delivered.reduce((n, g) => n + g.ids.length, 0) +
      input.retriable.reduce((n, g) => n + g.ids.length, 0) +
      input.failed.reduce((n, g) => n + g.ids.length, 0);
    if (total === 0) return 0;

    try {
      return await db.transaction(async (tx) => {
        let settled = 0;
        const settle = async (ids: string[], values: Record<string, unknown>) => {
          settled += await tx(TableName.EventOutbox)
            .whereIn("id", ids)
            .where("status", EventOutboxStatus.Processing)
            .where("lockToken", input.lockToken)
            .update({ lockedAt: null, lockToken: null, ...values });
        };

        const progressOf = (group: { progress?: Record<string, unknown> | null }) =>
          group.progress !== undefined ? { progress: JSON.stringify(group.progress) } : {};

        for (const group of input.delivered) {
          // eslint-disable-next-line no-await-in-loop -- one shared tx connection; writes are serial
          await settle(group.ids, { status: EventOutboxStatus.Delivered, lastError: null, ...progressOf(group) });
        }

        for (const group of input.retriable) {
          // eslint-disable-next-line no-await-in-loop -- see above
          await settle(group.ids, {
            status: EventOutboxStatus.Retry,
            attempts: db.raw('"attempts" + 1'),
            nextRetryAt: db.raw(`NOW() + (? || ' milliseconds')::INTERVAL`, [group.nextRetryDelayMs]),
            lastError: group.error ?? null,
            ...progressOf(group)
          });
        }

        for (const group of input.failed) {
          // eslint-disable-next-line no-await-in-loop -- see above
          await settle(group.ids, {
            status: EventOutboxStatus.Failed,
            attempts: db.raw('"attempts" + 1'),
            lastError: group.error ?? null
          });
        }

        return settled;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "EventOutbox: commitResults" });
    }
  };

  const recoverStaleClaims = async (input: {
    thresholdMs: number;
    maxAttempts: number;
    limit: number;
  }): Promise<{ retried: number; failed: { consumer: string; count: number }[] }> => {
    try {
      return await db.transaction(async (tx) => {
        const staleRows = await tx(TableName.EventOutbox)
          .where("status", EventOutboxStatus.Processing)
          .andWhereRaw(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [input.thresholdMs])
          .orderBy("lockedAt", "asc")
          .limit(input.limit)
          .forUpdate()
          .skipLocked()
          .select<{ id: string; consumer: string; attempts: number }[]>("id", "consumer", "attempts");

        if (staleRows.length === 0) return { retried: 0, failed: [] };

        const exhaustedRows = staleRows.filter((row) => row.attempts + 1 >= input.maxAttempts);
        const exhausted = exhaustedRows.map((row) => row.id);
        const retriable = staleRows.filter((row) => row.attempts + 1 < input.maxAttempts);

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
              lockToken: null,
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
              lockToken: null,
              lastError: "Worker did not report a result before the claim went stale"
            });
        }

        const failedByConsumer = new Map<string, number>();
        for (const row of exhaustedRows) {
          failedByConsumer.set(row.consumer, (failedByConsumer.get(row.consumer) ?? 0) + 1);
        }

        return {
          retried: retriable.length,
          failed: [...failedByConsumer].map(([consumer, count]) => ({ consumer, count }))
        };
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
