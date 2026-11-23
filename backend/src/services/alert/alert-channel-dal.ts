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
    filter: { enabled?: boolean; readFromPrimary?: boolean } = {},
    tx?: Knex
  ): Promise<TAlertChannels[]> => {
    try {
      const query = (tx || (filter.readFromPrimary ? db : db.replicaNode()))(TableName.AlertChannel)
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

  const countAlertsByWorkflowIntegrationId = async (workflowIntegrationId: string, tx?: Knex): Promise<number> => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AlertChannel)
        .join(
          TableName.AlertChannelMembership,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertChannelMembership}.channelId`
        )
        .join(TableName.Alert, `${TableName.AlertChannelMembership}.alertId`, `${TableName.Alert}.id`)
        .leftJoin(TableName.Project, `${TableName.Alert}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.AlertChannel}.workflowIntegrationId`, workflowIntegrationId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .countDistinct(`${TableName.Alert}.id as count`)
        .first();

      return Number((result as { count?: string | number } | undefined)?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountAlertsByWorkflowIntegrationId" });
    }
  };

  return {
    ...alertChannelOrm,
    findByAlertId,
    findByAlertIds,
    countAlertsByWorkflowIntegrationId
  };
};
