import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { AlarmRunStatus } from "./alarm-types";

export type TAlarmHistoryDALFactory = ReturnType<typeof alarmHistoryDALFactory>;

export const alarmHistoryDALFactory = (db: TDbClient) => {
  const alarmHistoryOrm = ormify(db, TableName.AlarmHistory);

  const createWithTargets = async (
    alarmId: string,
    targetIds: string[],
    options: { status: string; error?: string }
  ): Promise<TAlarmHistory> => {
    try {
      return await db.transaction(async (tx) => {
        const [history] = await tx(TableName.AlarmHistory)
          .insert({ alarmId, status: options.status, error: options.error })
          .returning("*");

        if (targetIds.length > 0) {
          await tx(TableName.AlarmHistoryTarget).insert(
            targetIds.map((targetId) => ({ alarmHistoryId: history.id, targetId }))
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
  ): Promise<string[]> => {
    try {
      if (targetIds.length === 0) return [];

      const DEDUP_DRIFT_BUFFER_MINUTES = 15;
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - withinHours);
      cutoffDate.setMinutes(cutoffDate.getMinutes() + DEDUP_DRIFT_BUFFER_MINUTES);

      const rows = (await (tx || db.replicaNode())(`${TableName.AlarmHistory} as hist`)
        .join(`${TableName.AlarmHistoryTarget} as tgt`, "hist.id", "tgt.alarmHistoryId")
        .where("hist.alarmId", alarmId)
        .where("hist.status", AlarmRunStatus.SUCCESS)
        .where("hist.triggeredAt", ">=", cutoffDate)
        .whereIn("tgt.targetId", targetIds)
        .distinct("tgt.targetId")
        .select("tgt.targetId")) as Array<{ targetId: string }>;

      return rows.map((row) => row.targetId);
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
