import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannelRecipients } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlertChannelRecipientDALFactory = ReturnType<typeof alertChannelRecipientDALFactory>;

export const alertChannelRecipientDALFactory = (db: TDbClient) => {
  const alertChannelRecipientOrm = ormify(db, TableName.AlertChannelRecipient);

  const findByChannelId = async (channelId: string, tx?: Knex): Promise<TAlertChannelRecipients[]> => {
    try {
      const recipients = await (tx || db.replicaNode())(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.channelId`, channelId)
        .select(selectAllTableCols(TableName.AlertChannelRecipient));

      return recipients as TAlertChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelId" });
    }
  };

  const findByChannelIds = async (channelIds: string[], tx?: Knex): Promise<TAlertChannelRecipients[]> => {
    try {
      if (!channelIds.length) return [];
      const recipients = await (tx || db.replicaNode())(TableName.AlertChannelRecipient)
        .whereIn(`${TableName.AlertChannelRecipient}.channelId`, channelIds)
        .select(selectAllTableCols(TableName.AlertChannelRecipient));

      return recipients as TAlertChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelIds" });
    }
  };

  const deleteByChannelId = async (channelId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.channelId`, channelId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByChannelId" });
    }
  };

  return {
    ...alertChannelRecipientOrm,
    findByChannelId,
    findByChannelIds,
    deleteByChannelId
  };
};
