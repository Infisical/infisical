import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannelMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlertChannelMembershipDALFactory = ReturnType<typeof alertChannelMembershipDALFactory>;

export const alertChannelMembershipDALFactory = (db: TDbClient) => {
  const alertChannelMembershipOrm = ormify(db, TableName.AlertChannelMembership);

  const findByAlertId = async (alertId: string, tx?: Knex): Promise<TAlertChannelMemberships[]> => {
    try {
      const memberships = await (tx || db.replicaNode())(TableName.AlertChannelMembership)
        .where(`${TableName.AlertChannelMembership}.alertId`, alertId)
        .select(selectAllTableCols(TableName.AlertChannelMembership));

      return memberships as TAlertChannelMemberships[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlertId" });
    }
  };

  const deleteByAlertId = async (alertId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlertChannelMembership)
        .where(`${TableName.AlertChannelMembership}.alertId`, alertId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByAlertId" });
    }
  };

  const countByChannelId = async (channelId: string, tx?: Knex): Promise<number> => {
    try {
      const [row] = await (tx || db.replicaNode())(TableName.AlertChannelMembership)
        .where(`${TableName.AlertChannelMembership}.channelId`, channelId)
        .count({ count: "*" });
      return Number((row as { count?: string | number })?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountByChannelId" });
    }
  };

  return {
    ...alertChannelMembershipOrm,
    findByAlertId,
    deleteByAlertId,
    countByChannelId
  };
};
