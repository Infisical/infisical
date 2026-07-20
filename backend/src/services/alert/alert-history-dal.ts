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

export const alertHistoryDALFactory = (db: TDbClient) => {
  const alertHistoryOrm = ormify(db, TableName.AlertHistory);

  const createWithTargets = async (
    alertId: string,
    options: { status: string; error?: string },
    deliveries: TAlertTargetDelivery[]
  ): Promise<TAlertHistory> => {
    try {
      return await db.transaction(async (tx) => {
        const [history] = await tx(TableName.AlertHistory)
          .insert({ alertId, status: options.status, error: options.error })
          .returning("*");

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

      const rows = (await (tx || db.replicaNode())(`${TableName.AlertHistory} as hist`)
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

  return {
    ...alertHistoryOrm,
    createWithTargets,
    findRecentlyAlertedTargets
  };
};
