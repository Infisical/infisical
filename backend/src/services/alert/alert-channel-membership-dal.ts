import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAlertChannelMembershipDALFactory = ReturnType<typeof alertChannelMembershipDALFactory>;

export const alertChannelMembershipDALFactory = (db: TDbClient) => {
  const alertChannelMembershipOrm = ormify(db, TableName.AlertChannelMembership);

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
    countByChannelId
  };
};
