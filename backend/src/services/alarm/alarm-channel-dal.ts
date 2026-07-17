import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmChannels, TAlarmChannelsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmChannelDALFactory = ReturnType<typeof alarmChannelDALFactory>;

export const alarmChannelDALFactory = (db: TDbClient) => {
  const alarmChannelOrm = ormify(db, TableName.AlarmChannel);

  const insertMany = async (data: TAlarmChannelsInsert[], tx?: Knex): Promise<TAlarmChannels[]> => {
    try {
      if (!data.length) return [];
      const res = await (tx || db)(TableName.AlarmChannel).insert(data).returning("*");
      return res as TAlarmChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "InsertMany" });
    }
  };

  const findByAlarmId = async (alarmId: string, tx?: Knex): Promise<TAlarmChannels[]> => {
    try {
      const channels = await (tx || db.replicaNode())(TableName.AlarmChannel)
        .where(`${TableName.AlarmChannel}.alarmId`, alarmId)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .orderBy(`${TableName.AlarmChannel}.createdAt`, "asc");

      return channels as TAlarmChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmId" });
    }
  };

  const findByAlarmIds = async (alarmIds: string[], tx?: Knex): Promise<TAlarmChannels[]> => {
    try {
      if (!alarmIds.length) return [];
      const channels = await (tx || db.replicaNode())(TableName.AlarmChannel)
        .whereIn(`${TableName.AlarmChannel}.alarmId`, alarmIds)
        .select(selectAllTableCols(TableName.AlarmChannel))
        .orderBy(`${TableName.AlarmChannel}.createdAt`, "asc");

      return channels as TAlarmChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmIds" });
    }
  };

  return {
    ...alarmChannelOrm,
    insertMany,
    findByAlarmId,
    findByAlarmIds
  };
};
