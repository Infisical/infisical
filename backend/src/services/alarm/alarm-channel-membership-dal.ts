import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarmChannelMemberships } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmChannelMembershipDALFactory = ReturnType<typeof alarmChannelMembershipDALFactory>;

export const alarmChannelMembershipDALFactory = (db: TDbClient) => {
  const alarmChannelMembershipOrm = ormify(db, TableName.AlarmChannelMembership);

  const findByAlarmId = async (alarmId: string, tx?: Knex): Promise<TAlarmChannelMemberships[]> => {
    try {
      const memberships = await (tx || db.replicaNode())(TableName.AlarmChannelMembership)
        .where(`${TableName.AlarmChannelMembership}.alarmId`, alarmId)
        .select(selectAllTableCols(TableName.AlarmChannelMembership));

      return memberships as TAlarmChannelMemberships[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByAlarmId" });
    }
  };

  const deleteByAlarmId = async (alarmId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlarmChannelMembership)
        .where(`${TableName.AlarmChannelMembership}.alarmId`, alarmId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByAlarmId" });
    }
  };

  return {
    ...alarmChannelMembershipOrm,
    findByAlarmId,
    deleteByAlarmId
  };
};
