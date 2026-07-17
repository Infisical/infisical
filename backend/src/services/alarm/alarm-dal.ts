import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlarms } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlarmDALFactory = ReturnType<typeof alarmDALFactory>;

export const alarmDALFactory = (db: TDbClient) => {
  const alarmOrm = ormify(db, TableName.Alarm);

  const findEnabledByResourceType = async (resourceType: string, tx?: Knex): Promise<TAlarms[]> => {
    try {
      const alarms = await (tx || db.replicaNode())(TableName.Alarm)
        .leftJoin(TableName.Project, `${TableName.Alarm}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alarm}.resourceType`, resourceType)
        .where(`${TableName.Alarm}.enabled`, true)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.Alarm))
        .orderBy(`${TableName.Alarm}.createdAt`, "asc");

      return alarms as TAlarms[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindEnabledByResourceType" });
    }
  };

  return {
    ...alarmOrm,
    findEnabledByResourceType
  };
};
