import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannelRecipients } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { DIRECTED_ALERT_CHANNEL_TYPES } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

export type TAlertChannelRecipientDALFactory = ReturnType<typeof alertChannelRecipientDALFactory>;

export const alertChannelRecipientDALFactory = (db: TDbClient) => {
  const alertChannelRecipientOrm = ormify(db, TableName.AlertChannelRecipient);

  const $disableChannelsWithoutRecipients = async (channelIds: string[], tx?: Knex): Promise<number> => {
    if (!channelIds.length) return 0;

    return (tx || db)(TableName.AlertChannel)
      .whereIn(`${TableName.AlertChannel}.id`, channelIds)
      .whereIn(`${TableName.AlertChannel}.channelType`, DIRECTED_ALERT_CHANNEL_TYPES)
      .where(`${TableName.AlertChannel}.enabled`, true)
      .whereNotExists((qb) => {
        void qb
          .select(db.raw("1"))
          .from(TableName.AlertChannelRecipient)
          .whereRaw(`"${TableName.AlertChannelRecipient}"."channelId" = "${TableName.AlertChannel}"."id"`);
      })
      .update({ enabled: false });
  };

  const findByChannelIds = async (channelIds: string[], tx?: Knex): Promise<TAlertChannelRecipients[]> => {
    try {
      if (!channelIds.length) return [];
      const recipients = await (tx || db.replicaNode())(TableName.AlertChannelRecipient)
        .whereIn(`${TableName.AlertChannelRecipient}.channelId`, channelIds)
        .select(selectAllTableCols(TableName.AlertChannelRecipient));

      return recipients as TAlertChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelIds" });
    }
  };

  const deleteByChannelId = async (channelId: string, tx?: Knex): Promise<number> => {
    try {
      return await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.channelId`, channelId)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByChannelId" });
    }
  };

  // Prunes recipient rows for principals that no longer exist anywhere (a hard-deleted user or group).
  // principalId carries no FK, so nothing cascades these away on its own.
  const deleteByPrincipals = async (
    { principalType, principalIds }: { principalType: AlertPrincipalType; principalIds: string[] },
    tx?: Knex
  ): Promise<number> => {
    try {
      if (!principalIds.length) return 0;

      const deleted = (await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.principalType`, principalType)
        .whereIn(`${TableName.AlertChannelRecipient}.principalId`, principalIds)
        .del()
        .returning("channelId")) as { channelId: string }[];

      await $disableChannelsWithoutRecipients([...new Set(deleted.map((row) => row.channelId))], tx);

      return deleted.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteByPrincipals" });
    }
  };

  const deleteUsersRecipientsByScope = async (
    { userIds, orgId, projectId }: { userIds: string[]; orgId?: string; projectId?: string },
    tx?: Knex
  ): Promise<number> => {
    try {
      if (!userIds.length || (!orgId && !projectId)) return 0;

      const channelIds = (tx || db)(TableName.AlertChannel).select("id");
      if (projectId) void channelIds.where(`${TableName.AlertChannel}.projectId`, projectId);
      else void channelIds.where(`${TableName.AlertChannel}.orgId`, orgId as string);

      const deleted = (await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.principalType`, AlertPrincipalType.USER)
        .whereIn(`${TableName.AlertChannelRecipient}.principalId`, userIds)
        .whereIn(`${TableName.AlertChannelRecipient}.channelId`, channelIds)
        .del()
        .returning("channelId")) as { channelId: string }[];

      await $disableChannelsWithoutRecipients([...new Set(deleted.map((row) => row.channelId))], tx);

      return deleted.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteUsersRecipientsByScope" });
    }
  };

  return {
    ...alertChannelRecipientOrm,
    findByChannelIds,
    deleteByChannelId,
    deleteByPrincipals,
    deleteUsersRecipientsByScope
  };
};
