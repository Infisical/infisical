import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannels } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAlertChannelDALFactory = ReturnType<typeof alertChannelDALFactory>;

export type TAlertChannelWithUsage = TAlertChannels & { usageCount: number };
export type TAlertChannelWithAlertId = TAlertChannels & { alertId: string };

export const alertChannelDALFactory = (db: TDbClient) => {
  const alertChannelOrm = ormify(db, TableName.AlertChannel);

  const scopeFilter = (query: Knex.QueryBuilder, orgId: string, projectId?: string | null): void => {
    void query.where(`${TableName.AlertChannel}.orgId`, orgId);
    if (projectId) void query.where(`${TableName.AlertChannel}.projectId`, projectId);
    else void query.whereNull(`${TableName.AlertChannel}.projectId`);
  };

  const findWithUsageByScope = async (
    { orgId, projectId }: { orgId: string; projectId?: string | null },
    tx?: Knex
  ): Promise<TAlertChannelWithUsage[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AlertChannel)
        .leftJoin(
          TableName.AlertChannelMembership,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertChannelMembership}.channelId`
        )
        .leftJoin(TableName.Project, `${TableName.AlertChannel}.projectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Project}.deleteAfter`);
      scopeFilter(query, orgId, projectId);

      const rows = await query
        .groupBy(`${TableName.AlertChannel}.id`)
        .select(selectAllTableCols(TableName.AlertChannel))
        .select(db.raw(`count(??.??)::int as "usageCount"`, [TableName.AlertChannelMembership, "id"]))
        .orderBy(`${TableName.AlertChannel}.createdAt`, "asc");

      return rows as unknown as TAlertChannelWithUsage[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindWithUsageByScope" });
    }
  };

  const findActiveById = async (id: string, tx?: Knex): Promise<TAlertChannels | undefined> => {
    try {
      const channel = await (tx || db.replicaNode())(TableName.AlertChannel)
        .leftJoin(TableName.Project, `${TableName.AlertChannel}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.AlertChannel}.id`, id)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(selectAllTableCols(TableName.AlertChannel))
        .first();

      return channel as TAlertChannels | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindActiveById" });
    }
  };

  const findByNameInScope = async (
    name: string,
    { orgId, projectId }: { orgId: string; projectId?: string | null },
    tx?: Knex
  ): Promise<TAlertChannels | undefined> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AlertChannel).where(`${TableName.AlertChannel}.name`, name);
      scopeFilter(query, orgId, projectId);
      const channel = await query.select(selectAllTableCols(TableName.AlertChannel)).first();
      return channel as TAlertChannels | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByNameInScope" });
    }
  };

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
    findWithUsageByScope,
    findActiveById,
    findByNameInScope,
    findByAlertId,
    findByAlertIds
  };
};
