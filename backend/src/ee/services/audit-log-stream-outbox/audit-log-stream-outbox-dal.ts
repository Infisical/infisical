import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";

import {
  AuditLogStreamOutboxStatus,
  TAuditLogStreamOutboxRow,
  TFailedStreamRow
} from "./audit-log-stream-outbox-types";

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
  const claimBatchForStream = async (
    streamId: string,
    limit: number,
    workerId: string
  ): Promise<TAuditLogStreamOutboxRow[]> => {
    try {
      return await db.transaction(async (tx) => {
        const lockedRows = await tx(TableName.AuditLogStreamOutbox)
          .where({ streamId })
          .whereIn("status", [AuditLogStreamOutboxStatus.Pending, AuditLogStreamOutboxStatus.Retry])
          .andWhere("nextRetryAt", "<=", tx.fn.now())
          .orderBy("id", "asc")
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
            lockedAt: tx.fn.now(),
            workerId
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
        lockedAt: null,
        workerId: null,
        lastError: null
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: markBatchAsDelivered" });
    }
  };

  // Release a claim by flipping rows back to 'retry' with an updated attempt count
  // and a future nextRetryAt. Used when the provider call fails for the whole batch.
  const markBatchForRetry = async (ids: number[], nextRetryAt: Date, errorMessage: string, tx?: Knex) => {
    if (ids.length === 0) return;
    try {
      await (tx || db)(TableName.AuditLogStreamOutbox)
        .whereIn("id", ids)
        .update({
          status: AuditLogStreamOutboxStatus.Retry,
          attempts: db.raw('"attempts" + 1'),
          nextRetryAt,
          lockedAt: null,
          workerId: null,
          lastError: errorMessage
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: markBatchForRetry" });
    }
  };

  // Move exhausted rows out of the hot table into the DLQ in one transaction —
  // copies the payload + audit history, then deletes the original rows so the
  // worker never picks them up again.
  const moveToDlq = async (rows: TAuditLogStreamOutboxRow[], errorMessage: string, tx?: Knex) => {
    if (rows.length === 0) return;
    try {
      const exec = async (trx: Knex) => {
        const dlqRows = rows.map((row) => ({
          originalAuditLogStreamOutboxId: row.id,
          streamId: row.streamId,
          orgId: row.orgId,
          payload: JSON.stringify(row.payload),
          attempts: row.attempts,
          lastError: errorMessage,
          originalCreatedAt: row.createdAt
        }));
        await trx.batchInsert(TableName.AuditLogStreamOutboxDlq, dlqRows);
        await trx(TableName.AuditLogStreamOutbox)
          .whereIn(
            "id",
            rows.map((row) => row.id)
          )
          .del();
      };

      if (tx) {
        await exec(tx);
      } else {
        await db.transaction(exec);
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: moveToDlq" });
    }
  };

  // Commit the outcome of a chunked delivery for a single claimed batch in one
  // transaction:
  //   - successIds: rows that reached the provider — flip to 'delivered' (kept
  //                 around as the dedup guard against a re-fanout from a
  //                 retried ingest tick; pruned later by the cleanup cron).
  //   - retriable:  rows whose chunk failed but can still retry — flip to 'retry'
  //                 with attempt+1 and lastError = the chunk's error.
  //   - exhausted:  rows whose chunk failed and used up MAX_ATTEMPTS — move to DLQ.
  // Failed rows arrive as TFailedStreamRow so each carries the errorMessage from
  // its own chunk (different chunks of one claim can fail with different errors).
  // We group by errorMessage and issue one markBatchForRetry / moveToDlq per
  // group so each row's lastError reflects what actually broke for it.
  //
  // Folding all three outcomes into a single transaction means a crash between
  // the writes can't leave the claim half-applied (e.g. some rows flipped to
  // 'delivered' but retriable rows still 'processing'); either every write
  // commits or none do, and the stale-claim sweeper picks up an un-applied
  // claim on the next pass.
  const commitDeliveryResult = async (input: {
    successIds: number[];
    retriable: { rows: TFailedStreamRow[]; nextRetryAt: Date } | null;
    exhausted: TFailedStreamRow[];
  }) => {
    const retriableRows = input.retriable?.rows ?? [];
    if (input.successIds.length === 0 && retriableRows.length === 0 && input.exhausted.length === 0) return;
    try {
      await db.transaction(async (tx) => {
        if (input.successIds.length > 0) {
          await markBatchAsDelivered(input.successIds, tx);
        }
        if (input.retriable && retriableRows.length > 0) {
          const idsByError = new Map<string, number[]>();
          for (const { row, errorMessage } of retriableRows) {
            const existing = idsByError.get(errorMessage);
            if (existing) existing.push(row.id);
            else idsByError.set(errorMessage, [row.id]);
          }
          for (const [errorMessage, ids] of idsByError) {
            // eslint-disable-next-line no-await-in-loop
            await markBatchForRetry(ids, input.retriable.nextRetryAt, errorMessage, tx);
          }
        }
        if (input.exhausted.length > 0) {
          const rowsByError = new Map<string, TAuditLogStreamOutboxRow[]>();
          for (const { row, errorMessage } of input.exhausted) {
            const existing = rowsByError.get(errorMessage);
            if (existing) existing.push(row);
            else rowsByError.set(errorMessage, [row]);
          }
          for (const [errorMessage, rows] of rowsByError) {
            // eslint-disable-next-line no-await-in-loop
            await moveToDlq(rows, errorMessage, tx);
          }
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
  // moved to DLQ in the same transaction.
  const recoverStaleClaims = async (
    thresholdMs: number,
    maxAttempts: number
  ): Promise<{ retried: number; movedToDlq: number }> => {
    const errorMessage = "stale-claim-recovered: worker did not release lock before threshold";
    try {
      return await db.transaction(async (tx) => {
        const staleRows = await tx(TableName.AuditLogStreamOutbox)
          .where("status", AuditLogStreamOutboxStatus.Processing)
          .andWhereRaw(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [thresholdMs])
          .forUpdate()
          .skipLocked()
          .select<TAuditLogStreamOutboxRow[]>("*");

        if (staleRows.length === 0) return { retried: 0, movedToDlq: 0 };

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
              lockedAt: null,
              workerId: null,
              lastError: errorMessage
            });
        }

        if (exhausted.length > 0) {
          await moveToDlq(exhausted, errorMessage, tx);
        }

        return { retried: retriable.length, movedToDlq: exhausted.length };
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
      }
      return total;
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: deleteDeliveredOlderThan" });
    }
  };

  const deleteDlqOlderThan = async (retentionMs: number, batchSize = 10_000, maxBatches = 100): Promise<number> => {
    try {
      let total = 0;
      for (let i = 0; i < maxBatches; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const deleted = await db(TableName.AuditLogStreamOutboxDlq)
          .whereIn("id", function selectExpiredIds() {
            void this.from(TableName.AuditLogStreamOutboxDlq)
              .select("id")
              .whereRaw(`"failedAt" < NOW() - (? || ' milliseconds')::INTERVAL`, [retentionMs])
              .limit(batchSize);
          })
          .del();

        total += deleted;
        if (deleted < batchSize) break;
      }
      return total;
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: deleteDlqOlderThan" });
    }
  };

  const findStreamsWithOverdueRows = async (): Promise<{ streamId: string; orgId: string; provider: string }[]> => {
    try {
      return await db(`${TableName.AuditLogStreamOutbox} as o`)
        .join(`${TableName.AuditLogStream} as s`, "s.id", "o.streamId")
        .whereIn("o.status", [AuditLogStreamOutboxStatus.Pending, AuditLogStreamOutboxStatus.Retry])
        .andWhere("o.nextRetryAt", "<=", db.fn.now())
        .distinct<
          { streamId: string; orgId: string; provider: string }[]
        >("o.streamId as streamId", "o.orgId as orgId", "s.provider as provider");
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
    deleteDeliveredOlderThan,
    deleteDlqOlderThan
  };
};
