import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmRecipients, TAlarmRecipientsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmRecipientDALFactory = ReturnType<typeof alarmRecipientDALFactory>;

export const alarmRecipientDALFactory = (db: TDbClient) => {
  const alarmRecipientOrm = ormify(db, TableName.AlarmRecipient);

  const insertMany = async (data: TAlarmRecipientsInsert[], tx?: Knex): Promise<TAlarmRecipients[]> => {
    try {
      if (!data.length) return [];
      const res = await (tx || db)(TableName.AlarmRecipient).insert(data).returning("*");
      return res as TAlarmRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "InsertMany" });
    }
  };

  const findByAlarmId = async (alarmId: string, tx?: Knex): Promise<TAlarmRecipients[]> => {
    try {
      const recipients = await (tx || db.replicaNode())(TableName.AlarmRecipient)
        .where(`${TableName.AlarmRecipient}.alarmId`, alarmId)
        .select(selectAllTableCols(TableName.AlarmRecipient));

      return recipients as TAlarmRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmId" });
    }
  };

  const findByAlarmIds = async (alarmIds: string[], tx?: Knex): Promise<TAlarmRecipients[]> => {
    try {
      if (!alarmIds.length) return [];
      const recipients = await (tx || db.replicaNode())(TableName.AlarmRecipient)
        .whereIn(`${TableName.AlarmRecipient}.alarmId`, alarmIds)
        .select(selectAllTableCols(TableName.AlarmRecipient));

      return recipients as TAlarmRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmIds" });
    }
  };

  const deleteByAlarmId = async (alarmId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlarmRecipient).where(`${TableName.AlarmRecipient}.alarmId`, alarmId).del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByAlarmId" });
    }
  };

  return {
    ...alarmRecipientOrm,
    insertMany,
    findByAlarmId,
    findByAlarmIds,
    deleteByAlarmId
  };
};
