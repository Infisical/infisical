import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAuditLogs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

import { AuditLogStreamOutboxStatus, TAuditLogStreamOutboxRow } from "./audit-log-stream-outbox-types";

export type TAuditLogStreamOutboxDALFactory = ReturnType<typeof auditLogStreamOutboxDALFactory>;

export type TInsertOutboxRow = {
  streamId: string;
  orgId: string;
  payload: TAuditLogs;
};

export const auditLogStreamOutboxDALFactory = (db: TDbClient) => {
  const batchInsert = async (rows: TInsertOutboxRow[], tx?: Knex) => {
    if (rows.length === 0) return;
    try {
      const records = rows.map((row) => ({
        streamId: row.streamId,
        orgId: row.orgId,
        // Store as native JSONB; Knex serializes JS objects when the column type is jsonb.
        payload: JSON.stringify(row.payload),
        status: AuditLogStreamOutboxStatus.Pending
      }));
      await (tx || db).batchInsert(TableName.AuditLogStreamOutbox, records);
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

  const deleteByIds = async (ids: number[], tx?: Knex) => {
    if (ids.length === 0) return;
    try {
      await (tx || db)(TableName.AuditLogStreamOutbox).whereIn("id", ids).del();
    } catch (error) {
      throw new DatabaseError({ error, name: "AuditLogStreamOutbox: deleteByIds" });
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

  return {
    batchInsert,
    claimBatchForStream,
    deleteByIds,
    markBatchForRetry,
    moveToDlq
  };
};
