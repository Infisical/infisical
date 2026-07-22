import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannels } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlertChannelDALFactory = ReturnType<typeof alertChannelDALFactory>;

type TAlertChannelWithAlertId = TAlertChannels & { alertId: string };

export const alertChannelDALFactory = (db: TDbClient) => {
  const alertChannelOrm = ormify(db, TableName.AlertChannel);

  const findByAlertId = async (
    alertId: string,
    filter: { enabled?: boolean } = {},
    tx?: Knex
  ): Promise<TAlertChannels[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AlertChannel)
        .join(
          TableName.AlertChannelMembership,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertChannelMembership}.channelId`
        )
        .where(`${TableName.AlertChannelMembership}.alertId`, alertId);

      if (filter.enabled !== undefined) void query.where(`${TableName.AlertChannel}.enabled`, filter.enabled);

      const channels = await query
        .select(selectAllTableCols(TableName.AlertChannel))
        .orderBy(`${TableName.AlertChannel}.createdAt`, "asc");

      return channels as TAlertChannels[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlertId" });
    }
  };

  // Returns each attached channel tagged with the alertId it is attached to, for batched list responses.
  const findByAlertIds = async (alertIds: string[], tx?: Knex): Promise<TAlertChannelWithAlertId[]> => {
    try {
      if (!alertIds.length) return [];
      const channels = await (tx || db.replicaNode())(TableName.AlertChannel)
        .join(
          TableName.AlertChannelMembership,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertChannelMembership}.channelId`
        )
        .whereIn(`${TableName.AlertChannelMembership}.alertId`, alertIds)
        .select(selectAllTableCols(TableName.AlertChannel))
        .select(db.ref("alertId").withSchema(TableName.AlertChannelMembership).as("alertId"))
        .orderBy(`${TableName.AlertChannel}.createdAt`, "asc");

      return channels as unknown as TAlertChannelWithAlertId[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlertIds" });
    }
  };

  return {
    ...alertChannelOrm,
    findByAlertId,
    findByAlertIds
  };
};
