import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPkiAlertChannels, TPkiAlertChannelsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPkiAlertChannelDALFactory = ReturnType<typeof pkiAlertChannelDALFactory>;

export const pkiAlertChannelDALFactory = (db: TDbClient) => {
  const pkiAlertChannelOrm = ormify(db, TableName.PkiAlertChannels);

  const insertMany = async (data: TPkiAlertChannelsInsert[], tx?: Knex): Promise<TPkiAlertChannels[]> => {
    try {
      if (!data.length) return [];

      const res = await (tx || db)(TableName.PkiAlertChannels).insert(data).returning("*");

      return res as TPkiAlertChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "InsertMany" });
    }
  };

  const findByAlertId = async (alertId: string, tx?: Knex): Promise<TPkiAlertChannels[]> => {
    try {
      const channels = await (tx || db.replicaNode())(TableName.PkiAlertChannels)
        .where(`${TableName.PkiAlertChannels}.alertId`, alertId)
        .select(selectAllTableCols(TableName.PkiAlertChannels))
        .orderBy(`${TableName.PkiAlertChannels}.createdAt`, "asc");

      return channels as TPkiAlertChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlertId" });
    }
  };

  const deleteByAlertId = async (alertId: string, tx?: Knex): Promise<number> => {
    try {
      const deletedCount = await (tx || db)(TableName.PkiAlertChannels)
        .where(`${TableName.PkiAlertChannels}.alertId`, alertId)
        .del();

      return deletedCount;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByAlertId" });
    }
  };

  return {
    ...pkiAlertChannelOrm,
    insertMany,
    findByAlertId,
    deleteByAlertId
  };
};
