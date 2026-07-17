import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { AlarmRunStatus } from "./alarm-types";

export type TAlarmHistoryDALFactory = ReturnType<typeof alarmHistoryDALFactory>;

export type TAlarmTargetDelivery = {
  targetId: string;
  channelId: string;
  channelType: string;
  status: string;
};

export type TRecentlyAlarmedTarget = { channelId: string; targetId: string };

export const alarmHistoryDALFactory = (db: TDbClient) => {
  const alarmHistoryOrm = ormify(db, TableName.AlarmHistory);

  const createWithTargets = async (
    alarmId: string,
    options: { status: string; error?: string },
    deliveries: TAlarmTargetDelivery[]
  ): Promise<TAlarmHistory> => {
    try {
      return await db.transaction(async (tx) => {
        const [history] = await tx(TableName.AlarmHistory)
          .insert({ alarmId, status: options.status, error: options.error })
          .returning("*");

        if (deliveries.length > 0) {
          await tx(TableName.AlarmHistoryTarget).insert(
            deliveries.map((delivery) => ({
              alarmHistoryId: history.id,
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

  const findRecentlyAlarmedTargets = async (
    alarmId: string,
    targetIds: string[],
    withinHours: number,
    tx?: Knex
  ): Promise<TRecentlyAlarmedTarget[]> => {
    try {
      if (targetIds.length === 0) return [];

      const DEDUP_DRIFT_BUFFER_MINUTES = 15;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - withinHours);
      cutoffDate.setMinutes(cutoffDate.getMinutes() - DEDUP_DRIFT_BUFFER_MINUTES);

      const rows = (await (tx || db.replicaNode())(`${TableName.AlarmHistory} as hist`)
        .join(`${TableName.AlarmHistoryTarget} as tgt`, "hist.id", "tgt.alarmHistoryId")
        .where("hist.alarmId", alarmId)
        .where("hist.triggeredAt", ">=", cutoffDate)
        .where("tgt.status", AlarmRunStatus.SUCCESS)
        .whereNotNull("tgt.channelId")
        .whereIn("tgt.targetId", targetIds)
        .distinct("tgt.channelId", "tgt.targetId")
        .select("tgt.channelId", "tgt.targetId")) as TRecentlyAlarmedTarget[];

      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecentlyAlarmedTargets" });
    }
  };

  return {
    ...alarmHistoryOrm,
    createWithTargets,
    findRecentlyAlarmedTargets
  };
};
