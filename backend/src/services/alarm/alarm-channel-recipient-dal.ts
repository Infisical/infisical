import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmChannelRecipients } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmChannelRecipientDALFactory = ReturnType<typeof alarmChannelRecipientDALFactory>;

export const alarmChannelRecipientDALFactory = (db: TDbClient) => {
  const alarmChannelRecipientOrm = ormify(db, TableName.AlarmChannelRecipient);

  const findByChannelId = async (channelId: string, tx?: Knex): Promise<TAlarmChannelRecipients[]> => {
    try {
      const recipients = await (tx || db.replicaNode())(TableName.AlarmChannelRecipient)
        .where(`${TableName.AlarmChannelRecipient}.channelId`, channelId)
        .select(selectAllTableCols(TableName.AlarmChannelRecipient));

      return recipients as TAlarmChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelId" });
    }
  };

  const findByChannelIds = async (channelIds: string[], tx?: Knex): Promise<TAlarmChannelRecipients[]> => {
    try {
      if (!channelIds.length) return [];
      const recipients = await (tx || db.replicaNode())(TableName.AlarmChannelRecipient)
        .whereIn(`${TableName.AlarmChannelRecipient}.channelId`, channelIds)
        .select(selectAllTableCols(TableName.AlarmChannelRecipient));

      return recipients as TAlarmChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelIds" });
    }
  };

  const deleteByChannelId = async (channelId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlarmChannelRecipient)
        .where(`${TableName.AlarmChannelRecipient}.channelId`, channelId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByChannelId" });
    }
  };

  return {
    ...alarmChannelRecipientOrm,
    findByChannelId,
    findByChannelIds,
    deleteByChannelId
  };
};
