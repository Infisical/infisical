import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmHistory } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

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
        .where("hist.triggeredAt", ">=", cutoffDate)
        .whereIn("tgt.targetId", targetIds)
        .distinct("tgt.targetId")
        .select("tgt.targetId")) as Array<{ targetId: string }>;

      return rows.map((row) => row.targetId);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecentlyAlarmedTargets" });
    }
  };

  const findLatestByAlarmId = async (alarmId: string, tx?: Knex): Promise<TAlarmHistory | undefined> => {
    try {
      const [latest] = await (tx || db.replicaNode())(TableName.AlarmHistory)
        .where(`${TableName.AlarmHistory}.alarmId`, alarmId)
        .orderBy(`${TableName.AlarmHistory}.triggeredAt`, "desc")
        .limit(1);
      return latest as TAlarmHistory | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestByAlarmId" });
    }
  };

  return {
    ...alarmHistoryOrm,
    createWithTargets,
    findRecentlyAlarmedTargets,
    findLatestByAlarmId
  };
};
