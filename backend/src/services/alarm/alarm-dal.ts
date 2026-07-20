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

  const findActiveById = async (id: string, tx?: Knex): Promise<TAlarms | undefined> => {
    try {
      const alarm = await (tx || db.replicaNode())(TableName.Alarm)
        .leftJoin(TableName.Project, `${TableName.Alarm}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alarm}.id`, id)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.Alarm))
        .first();

      return alarm as TAlarms | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveById" });
    }
  };

  const findActiveByScope = async (
    filter: {
      orgId: string;
      resourceType: string;
      projectId?: string | null;
      resourceId?: string | null;
      enabled?: boolean;
    },
    tx?: Knex
  ): Promise<TAlarms[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.Alarm)
        .leftJoin(TableName.Project, `${TableName.Alarm}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alarm}.orgId`, filter.orgId)
        .where(`${TableName.Alarm}.resourceType`, filter.resourceType)
        .whereNull(`${TableName.Project}.deleteAfter`);

      if (filter.projectId) void query.where(`${TableName.Alarm}.projectId`, filter.projectId);
      else void query.whereNull(`${TableName.Alarm}.projectId`);
      if (filter.resourceId === null) void query.whereNull(`${TableName.Alarm}.resourceId`);
      else if (filter.resourceId !== undefined) void query.where(`${TableName.Alarm}.resourceId`, filter.resourceId);
      if (filter.enabled !== undefined) void query.where(`${TableName.Alarm}.enabled`, filter.enabled);

      const alarms = await query
        .select(selectAllTableCols(TableName.Alarm))
        .orderBy(`${TableName.Alarm}.createdAt`, "asc");

      return alarms as TAlarms[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveByScope" });
    }
  };

  return {
    ...alarmOrm,
    findEnabledByResourceType,
    findActiveById,
    findActiveByScope
  };
};
