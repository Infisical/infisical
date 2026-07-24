import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAlertChannelRecipients } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { AlertPrincipalType } from "./alert-types";

export type TAlertChannelRecipientDALFactory = ReturnType<typeof alertChannelRecipientDALFactory>;

export const alertChannelRecipientDALFactory = (db: TDbClient) => {
  const alertChannelRecipientOrm = ormify(db, TableName.AlertChannelRecipient);

  const findByChannelId = async (channelId: string, tx?: Knex): Promise<TAlertChannelRecipients[]> => {
    try {
      const recipients = await (tx || db.replicaNode())(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.channelId`, channelId)
        .select(selectAllTableCols(TableName.AlertChannelRecipient));

      return recipients as TAlertChannelRecipients[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByChannelId" });
    }
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

  const deleteUsersRecipientsByScope = async (
    { userIds, orgId, projectId }: { userIds: string[]; orgId?: string; projectId?: string },
    tx?: Knex
  ): Promise<number> => {
    try {
      if (!userIds.length || (!orgId && !projectId)) return 0;

      const channelIds = (tx || db)(TableName.AlertChannel).select("id");
      if (projectId) void channelIds.where(`${TableName.AlertChannel}.projectId`, projectId);
      else void channelIds.where(`${TableName.AlertChannel}.orgId`, orgId as string);

      return await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.principalType`, AlertPrincipalType.USER)
        .whereIn(`${TableName.AlertChannelRecipient}.principalId`, userIds)
        .whereIn(`${TableName.AlertChannelRecipient}.channelId`, channelIds)
        .del();
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteUsersRecipientsByScope" });
    }
  };

  return {
    ...alertChannelRecipientOrm,
    findByChannelId,
    findByChannelIds,
    deleteByChannelId,
    deleteUsersRecipientsByScope
  };
};
