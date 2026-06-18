import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { AuditLogStreamOutboxStatus, TAuditLogStreamOutboxRow } from "./audit-log-stream-outbox-types";

export type TAuditLogStreamOutboxDALFactory = ReturnType<typeof auditLogStreamOutboxDALFactory>;

export type TInsertOutboxRow = {
  streamId: string;
  orgId: string;
  payload: TAuditLogs;
};

const OUTBOX_INSERT_CHUNK_SIZE = 1_000;

export const auditLogStreamOutboxDALFactory = (db: TDbClient) => {
  const batchInsert = async (rows: TInsertOutboxRow[], tx?: Knex) => {
    if (rows.length === 0) return;
    try {
      const records = rows.map((row) => ({
        streamId: row.streamId,
        orgId: row.orgId,
        auditLogId: row.payload.id,
        payload: JSON.stringify(row.payload),
        status: AuditLogStreamOutboxStatus.Pending
      }));

      const insertChunks = async (trx: Knex) => {
        for (const chunk of chunkArray(records, OUTBOX_INSERT_CHUNK_SIZE)) {
          // eslint-disable-next-line no-await-in-loop
          await trx(TableName.AuditLogStreamOutbox).insert(chunk).onConflict().ignore();
        }
      };

      if (tx) await insertChunks(tx);
      else await db.transaction(insertChunks);
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: batchInsert" });
    }
  };

  // Atomically claim up to `limit` ready rows for `streamId`: lock them with
  // FOR UPDATE SKIP LOCKED, mark them processing, and return them to the worker.
  // Runs inside a single transaction so the lock and the status flip commit together.
  const claimBatchForStream = async (streamId: string, limit: number): Promise<TAuditLogStreamOutboxRow[]> => {
    try {
      return await db.transaction(async (tx) => {
        const lockedRows = await tx(TableName.AuditLogStreamOutbox)
          .where({ streamId })
          .whereIn("status", [AuditLogStreamOutboxStatus.Pending, AuditLogStreamOutboxStatus.Retry])
          .andWhere("nextRetryAt", "<=", tx.fn.now())
          .orderBy([
            { column: "nextRetryAt", order: "asc" },
            { column: "id", order: "asc" }
          ])
          .limit(limit)
          .forUpdate()
          .skipLocked()
          .select<{ id: number }[]>("id");

        if (lockedRows.length === 0) return [];

        const ids = lockedRows.map((row) => row.id);
        const claimed = await tx(TableName.AuditLogStreamOutbox)
          .whereIn("id", ids)
          .update({
            status: AuditLogStreamOutboxStatus.Processing,
            lockedAt: tx.fn.now()
          })
          .returning("*");

        return claimed as unknown as TAuditLogStreamOutboxRow[];
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: claimBatchForStream" });
    }
  };

  const markBatchAsDelivered = async (ids: number[], tx?: Knex) => {
    if (ids.length === 0) return;
    try {
      await (tx || db)(TableName.AuditLogStreamOutbox).whereIn("id", ids).update({
        status: AuditLogStreamOutboxStatus.Delivered,
        lockedAt: null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: markBatchAsDelivered" });
    }
  };

  // Release a claim by flipping rows back to 'retry' with an updated attempt count
  // and a future nextRetryAt. Used when the provider call fails for the whole batch.
  // nextRetryAt is computed DB-side as NOW() + delay so it uses the same clock the
  // claim query compares against (no app/DB clock-skew drift on the retry schedule).
  const markBatchForRetry = async (ids: number[], nextRetryDelayMs: number, tx?: Knex) => {
    if (ids.length === 0) return;
    try {
      await (tx || db)(TableName.AuditLogStreamOutbox)
        .whereIn("id", ids)
        .update({
          status: AuditLogStreamOutboxStatus.Retry,
          attempts: db.raw('"attempts" + 1'),
          nextRetryAt: db.raw(`NOW() + (? || ' milliseconds')::INTERVAL`, [nextRetryDelayMs]),
          lockedAt: null
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: markBatchForRetry" });
    }
  };

  // Commit the outcome of a chunked delivery for a single claimed batch in one
  // transaction:
  //   - successIds:   rows that reached the provider — flip to 'delivered' (kept
  //                   around as the dedup guard against a re-fanout from a
  //                   retried ingest tick; pruned later by the cleanup cron).
  //   - retriable:    rows whose chunk failed but can still retry — flip to 'retry'
  //                   with attempt+1.
  //   - exhaustedIds: rows whose chunk failed and used up MAX_ATTEMPTS — deleted
  //                   (dropped). There is no DLQ; the caller logs + emits a metric
  //                   for these before committing, so the event is gone once the
  //                   row is removed.
  //
  // Folding all three outcomes into a single transaction means a crash between
  // the writes can't leave the claim half-applied (e.g. some rows flipped to
  // 'delivered' but retriable rows still 'processing'); either every write
  // commits or none do, and the stale-claim sweeper picks up an un-applied
  // claim on the next pass.
  const commitDeliveryResult = async (input: {
    successIds: number[];
    retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
    exhaustedIds: number[];
  }) => {
    const retriableCount = input.retriable?.groups.reduce((n, g) => n + g.ids.length, 0) ?? 0;
    if (input.successIds.length === 0 && retriableCount === 0 && input.exhaustedIds.length === 0) return;
    try {
      await db.transaction(async (tx) => {
        if (input.successIds.length > 0) {
          await markBatchAsDelivered(input.successIds, tx);
        }
        if (input.retriable) {
          for (const group of input.retriable.groups) {
            // eslint-disable-next-line no-await-in-loop
            await markBatchForRetry(group.ids, group.nextRetryDelayMs, tx);
          }
        }
        if (input.exhaustedIds.length > 0) {
          await tx(TableName.AuditLogStreamOutbox).whereIn("id", input.exhaustedIds).del();
        }
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: commitDeliveryResult" });
    }
  };

  // Stale-claim recovery: rows whose worker crashed mid-batch never had their
  // 'processing' status flipped back, so they're invisible to the drain query.
  // Treat a stale claim as a consumed attempt — a payload that crashes the worker
  // is indistinguishable from one that fails delivery, and either way must respect
  // MAX_ATTEMPTS so a poison pill can't loop forever. Rows that hit the cap are
  // dropped (deleted) in the same transaction; there is no DLQ. The caller logs +
  // emits a metric for the dropped count.
  const recoverStaleClaims = async (
    thresholdMs: number,
    maxAttempts: number
  ): Promise<{ retried: number; dropped: { streamId: string; orgId: string }[] }> => {
    try {
      return await db.transaction(async (tx) => {
        const staleRows = await tx(TableName.AuditLogStreamOutbox)
          .where("status", AuditLogStreamOutboxStatus.Processing)
          .andWhereRaw(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [thresholdMs])
          .forUpdate()
          .skipLocked()
          .select<TAuditLogStreamOutboxRow[]>("*");

        if (staleRows.length === 0) return { retried: 0, dropped: [] };

        const exhausted: TAuditLogStreamOutboxRow[] = [];
        const retriable: TAuditLogStreamOutboxRow[] = [];
        for (const row of staleRows) {
          if (row.attempts + 1 >= maxAttempts) {
            exhausted.push(row);
          } else {
            retriable.push(row);
          }
        }

        if (retriable.length > 0) {
          await tx(TableName.AuditLogStreamOutbox)
            .whereIn(
              "id",
              retriable.map((row) => row.id)
            )
            .update({
              status: AuditLogStreamOutboxStatus.Retry,
              attempts: db.raw('"attempts" + 1'),
              nextRetryAt: tx.fn.now(),
              lockedAt: null
            });
        }

        if (exhausted.length > 0) {
          await tx(TableName.AuditLogStreamOutbox)
            .whereIn(
              "id",
              exhausted.map((row) => row.id)
            )
            .del();
        }

        return {
          retried: retriable.length,
          dropped: exhausted.map((row) => ({ streamId: row.streamId, orgId: row.orgId }))
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: recoverStaleClaims" });
    }
  };

  const deleteDeliveredOlderThan = async (
    retentionMs: number,
    batchSize = 10_000,
    maxBatches = 100
  ): Promise<number> => {
    try {
      let total = 0;
      for (let i = 0; i < maxBatches; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const deleted = await db(TableName.AuditLogStreamOutbox)
          .whereIn("id", function selectExpiredIds() {
            void this.from(TableName.AuditLogStreamOutbox)
              .select("id")
              .where("status", AuditLogStreamOutboxStatus.Delivered)
              .andWhereRaw(`"updatedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [retentionMs])
              .limit(batchSize);
          })
          .del();

        total += deleted;
        if (deleted < batchSize) break;
        if (i === maxBatches - 1) {
          logger.warn(
            `audit-log-stream-outbox: deleteDeliveredOlderThan hit the batch ceiling [maxBatches=${maxBatches}] [batchSize=${batchSize}] [deleted=${total}] — eligible rows remain; cleanup is not keeping up with delivered-row inflow`
          );
        }
      }
      return total;
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: deleteDeliveredOlderThan" });
    }
  };

  const findStreamsWithOverdueRows = async (): Promise<{ streamId: string; orgId: string; provider: string }[]> => {
    try {
      const rows = await db(`${TableName.AuditLogStream} as s`)
        .whereExists((qb) => {
          void qb
            .select(db.raw("1"))
            .from(`${TableName.AuditLogStreamOutbox} as o`)
            .whereRaw('o."streamId" = s.id')
            .whereIn("o.status", [AuditLogStreamOutboxStatus.Pending, AuditLogStreamOutboxStatus.Retry])
            .andWhere("o.nextRetryAt", "<=", db.fn.now());
        })
        .select<{ streamId: string; orgId: string; provider: string }[]>(
          "s.id as streamId",
          "s.orgId as orgId",
          "s.provider as provider"
        );
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: findStreamsWithOverdueRows" });
    }
  };

  return {
    batchInsert,
    claimBatchForStream,
    commitDeliveryResult,
    recoverStaleClaims,
    findStreamsWithOverdueRows,
    deleteDeliveredOlderThan
  };
};
