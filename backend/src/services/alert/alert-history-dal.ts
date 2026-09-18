import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { AlertRunStatus } from "./alert-types";

export type TAlertHistoryDALFactory = ReturnType<typeof alertHistoryDALFactory>;

export type TAlertTargetDelivery = {
  targetId: string;
  channelId: string;
  channelType: string;
  status: string;
};

export type TRecentlyAlertedTarget = { channelId: string; targetId: string };

const ALERT_HISTORY_PRUNE_BATCH_SIZE = 5_000;
const ALERT_HISTORY_PRUNE_MAX_BATCHES = 20;
const ALERT_HISTORY_PRUNE_TIMEOUT_MS = 30_000;

export const alertHistoryDALFactory = (db: TDbClient) => {
  const alertHistoryOrm = ormify(db, TableName.AlertHistory);

  const createWithTargets = async (
    alertId: string,
    options: { status: string },
    deliveries: TAlertTargetDelivery[]
  ): Promise<TAlertHistory> => {
    try {
      return await db.transaction(async (tx) => {
        const [history] = await tx(TableName.AlertHistory).insert({ alertId, status: options.status }).returning("*");

        if (deliveries.length > 0) {
          await tx(TableName.AlertHistoryTarget).insert(
            deliveries.map((delivery) => ({
              alertHistoryId: history.id,
              targetId: delivery.targetId,
              channelId: delivery.channelId,
              channelType: delivery.channelType,
              status: delivery.status
            }))
          );
        }

        return history;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateWithTargets" });
    }
  };

  const findRecentlyAlertedTargets = async (
    alertId: string,
    targetIds: string[],
    withinHours: number,
    tx?: Knex
  ): Promise<TRecentlyAlertedTarget[]> => {
    try {
      if (targetIds.length === 0) return [];

      const DEDUP_DRIFT_BUFFER_MINUTES = 15;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - withinHours);
      cutoffDate.setMinutes(cutoffDate.getMinutes() - DEDUP_DRIFT_BUFFER_MINUTES);

      const rows = (await (tx || db)(`${TableName.AlertHistory} as hist`)
        .join(`${TableName.AlertHistoryTarget} as tgt`, "hist.id", "tgt.alertHistoryId")
        .where("hist.alertId", alertId)
        .where("hist.triggeredAt", ">=", cutoffDate)
        .where("tgt.status", AlertRunStatus.SUCCESS)
        .whereNotNull("tgt.channelId")
        .whereIn("tgt.targetId", targetIds)
        .distinct("tgt.channelId", "tgt.targetId")
        .select("tgt.channelId", "tgt.targetId")) as TRecentlyAlertedTarget[];

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecentlyAlertedTargets" });
    }
  };

  const deleteExpiredHistory = async ({
    before,
    batchSize = ALERT_HISTORY_PRUNE_BATCH_SIZE,
    maxBatches = ALERT_HISTORY_PRUNE_MAX_BATCHES
  }: {
    before: Date;
    batchSize?: number;
    maxBatches?: number;
  }): Promise<{ deleted: number; hasMore: boolean }> => {
    try {
      let deleted = 0;

      for (let batch = 0; batch < maxBatches; batch += 1) {
        // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
        const removed = await db.transaction(async (tx): Promise<number> => {
          await tx.raw(`SET LOCAL statement_timeout = ${ALERT_HISTORY_PRUNE_TIMEOUT_MS}`);

          return tx(TableName.AlertHistory)
            .whereIn(
              "id",
              tx(TableName.AlertHistory)
                .select("id")
                .where("triggeredAt", "<", before)
                .orderBy("triggeredAt", "asc")
                .limit(batchSize)
            )
            .del();
        });

        deleted += removed;
        if (removed < batchSize) return { deleted, hasMore: false };
      }

      return { deleted, hasMore: true };
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteExpiredHistory" });
    }
  };

  return {
    ...alertHistoryOrm,
    createWithTargets,
    findRecentlyAlertedTargets,
    deleteExpiredHistory
  };
};
