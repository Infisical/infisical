import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlerts } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { AlertTriggerType } from "./alert-types";

export type TAlertDALFactory = ReturnType<typeof alertDALFactory>;

export const alertDALFactory = (db: TDbClient) => {
  const alertOrm = ormify(db, TableName.Alert);

  const findEnabledByResourceType = async (resourceType: string, tx?: Knex): Promise<TAlerts[]> => {
    try {
      const alerts = await (tx || db.replicaNode())(TableName.Alert)
        .leftJoin(TableName.Project, `${TableName.Alert}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alert}.resourceType`, resourceType)
        .where(`${TableName.Alert}.triggerType`, AlertTriggerType.Scheduled)
        .where(`${TableName.Alert}.enabled`, true)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.Alert))
        .orderBy(`${TableName.Alert}.createdAt`, "asc");

      return alerts as TAlerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindEnabledByResourceType" });
    }
  };

  const findActiveById = async (id: string, tx?: Knex): Promise<TAlerts | undefined> => {
    try {
      const alert = await (tx || db.replicaNode())(TableName.Alert)
        .leftJoin(TableName.Project, `${TableName.Alert}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alert}.id`, id)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.Alert))
        .first();

      return alert as TAlerts | undefined;
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
  ): Promise<TAlerts[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.Alert)
        .leftJoin(TableName.Project, `${TableName.Alert}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alert}.orgId`, filter.orgId)
        .where(`${TableName.Alert}.resourceType`, filter.resourceType)
        .whereNull(`${TableName.Project}.deleteAfter`);

      if (filter.projectId) void query.where(`${TableName.Alert}.projectId`, filter.projectId);
      else void query.whereNull(`${TableName.Alert}.projectId`);
      if (filter.resourceId === null) void query.whereNull(`${TableName.Alert}.resourceId`);
      else if (filter.resourceId !== undefined) void query.where(`${TableName.Alert}.resourceId`, filter.resourceId);
      if (filter.enabled !== undefined) void query.where(`${TableName.Alert}.enabled`, filter.enabled);

      const alerts = await query
        .select(selectAllTableCols(TableName.Alert))
        .orderBy(`${TableName.Alert}.createdAt`, "asc");

      return alerts as TAlerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveByScope" });
    }
  };

  return {
    ...alertOrm,
    findEnabledByResourceType,
    findActiveById,
    findActiveByScope
  };
};
