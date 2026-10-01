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
        .whereExists(
          (qb) =>
            void qb
              .select(db.raw("1"))
              .from(TableName.AlertChannelMembership)
              .join(
                TableName.AlertChannel,
                `${TableName.AlertChannelMembership}.channelId`,
                `${TableName.AlertChannel}.id`
              )
              .whereRaw(`"${TableName.AlertChannelMembership}"."alertId" = "${TableName.Alert}"."id"`)
              .where(`${TableName.AlertChannel}.enabled`, true)
        )
        .select(selectAllTableCols(TableName.Alert))
        .orderBy(`${TableName.Alert}.createdAt`, "asc");

      return alerts as TAlerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindEnabledByResourceType" });
    }
  };

  // Event path only. Reads the primary: an empty result marks the event delivered, and a replica may
  // not have the alert yet.
  const findEnabledForEvent = async (
    filter: {
      orgId: string;
      projectId?: string | null;
      resourceType: string;
      resourceId: string;
      eventType: string;
    },
    tx?: Knex
  ): Promise<TAlerts[]> => {
    try {
      const query = (tx || db)(TableName.Alert)
        .leftJoin(TableName.Project, `${TableName.Alert}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Alert}.orgId`, filter.orgId)
        .where(`${TableName.Alert}.resourceType`, filter.resourceType)
        .where(`${TableName.Alert}.resourceId`, filter.resourceId)
        .where(`${TableName.Alert}.eventType`, filter.eventType)
        .where(`${TableName.Alert}.triggerType`, AlertTriggerType.Event)
        .where(`${TableName.Alert}.enabled`, true)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .whereExists(
          (qb) =>
            void qb
              .select(db.raw("1"))
              .from(TableName.AlertChannelMembership)
              .join(
                TableName.AlertChannel,
                `${TableName.AlertChannelMembership}.channelId`,
                `${TableName.AlertChannel}.id`
              )
              .whereRaw(`"${TableName.AlertChannelMembership}"."alertId" = "${TableName.Alert}"."id"`)
              .where(`${TableName.AlertChannel}.enabled`, true)
        );

      if (filter.projectId) {
        void query.where(
          (builder) =>
            void builder
              .where(`${TableName.Alert}.projectId`, filter.projectId as string)
              .orWhereNull(`${TableName.Alert}.projectId`)
        );
      }

      const alerts = await query
        .select(selectAllTableCols(TableName.Alert))
        .orderBy(`${TableName.Alert}.createdAt`, "asc");

      return alerts as TAlerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindEnabledForEvent" });
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

  const findByChannelId = async (channelId: string, tx?: Knex): Promise<TAlerts[]> => {
    try {
      const alerts = await (tx || db.replicaNode())(TableName.Alert)
        .join(TableName.AlertChannelMembership, `${TableName.Alert}.id`, `${TableName.AlertChannelMembership}.alertId`)
        .where(`${TableName.AlertChannelMembership}.channelId`, channelId)
        .select(selectAllTableCols(TableName.Alert))
        .orderBy(`${TableName.Alert}.createdAt`, "asc");

      return alerts as TAlerts[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelId" });
    }
  };

  const findScopedDuplicate = async (
    filter: {
      orgId: string;
      projectId?: string | null;
      resourceType: string;
      resourceId?: string | null;
      eventType: string;
    },
    tx?: Knex
  ): Promise<TAlerts | undefined> => {
    try {
      const query = (tx || db.replicaNode())(TableName.Alert)
        .where(`${TableName.Alert}.orgId`, filter.orgId)
        .where(`${TableName.Alert}.resourceType`, filter.resourceType)
        .where(`${TableName.Alert}.eventType`, filter.eventType);

      if (filter.projectId) void query.where(`${TableName.Alert}.projectId`, filter.projectId);
      else void query.whereNull(`${TableName.Alert}.projectId`);
      if (filter.resourceId) void query.where(`${TableName.Alert}.resourceId`, filter.resourceId);
      else void query.whereNull(`${TableName.Alert}.resourceId`);

      const alert = await query.select(selectAllTableCols(TableName.Alert)).first();
      return alert as TAlerts | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindScopedDuplicate" });
    }
  };

  // Principals on a resource's alert channels of one type, without loading or decrypting the channels.
  const findRecipientsForResources = async (
    {
      resourceType,
      resourceIds,
      channelType,
      principalType
    }: { resourceType: string; resourceIds: string[]; channelType: string; principalType: string },
    tx?: Knex
  ): Promise<{ resourceId: string; principalId: string }[]> => {
    if (resourceIds.length === 0) return [];
    try {
      const rows = await (tx || db.replicaNode())(TableName.Alert)
        .where(`${TableName.Alert}.resourceType`, resourceType)
        .whereIn(`${TableName.Alert}.resourceId`, resourceIds)
        .join(TableName.AlertChannelMembership, `${TableName.Alert}.id`, `${TableName.AlertChannelMembership}.alertId`)
        .join(TableName.AlertChannel, `${TableName.AlertChannelMembership}.channelId`, `${TableName.AlertChannel}.id`)
        .where(`${TableName.AlertChannel}.channelType`, channelType)
        .join(
          TableName.AlertChannelRecipient,
          `${TableName.AlertChannel}.id`,
          `${TableName.AlertChannelRecipient}.channelId`
        )
        .where(`${TableName.AlertChannelRecipient}.principalType`, principalType)
        .distinct(
          db.ref("resourceId").withSchema(TableName.Alert).as("resourceId"),
          db.ref("principalId").withSchema(TableName.AlertChannelRecipient).as("principalId")
        );
      return rows as { resourceId: string; principalId: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindRecipientsForResources" });
    }
  };

  return {
    ...alertOrm,
    findRecipientsForResources,
    findEnabledByResourceType,
    findEnabledForEvent,
    findActiveById,
    findActiveByScope,
    findByChannelId,
    findScopedDuplicate
  };
};
