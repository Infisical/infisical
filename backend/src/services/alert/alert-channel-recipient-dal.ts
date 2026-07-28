import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName, TAlertChannelRecipients } from "@app/db/schemas";
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

  const $whereUserStillInChannelScope = (qb: Knex.QueryBuilder) => {
    const principalIdAsUuid = `"${TableName.AlertChannelRecipient}"."principalId"::uuid`;

    void qb
      .select(db.raw("1"))
      .from({ ch: TableName.AlertChannel })
      .whereRaw(`"ch"."id" = "${TableName.AlertChannelRecipient}"."channelId"`)
      .whereExists((orgQb) => {
        void orgQb
          .select(db.raw("1"))
          .from({ om: TableName.Membership })
          .where("om.scope", AccessScope.Organization)
          .whereRaw(`"om"."scopeOrgId" = "ch"."orgId"`)
          .whereRaw(`"om"."actorUserId" = ${principalIdAsUuid}`);
      })
      .where((scopeQb) => {
        void scopeQb.whereNull("ch.projectId").orWhereExists((projectQb) => {
          void projectQb
            .select(db.raw("1"))
            .from({ pm: TableName.Membership })
            .leftJoin({ ugm: TableName.UserGroupMembership }, (join) => {
              void join.on("ugm.groupId", "pm.actorGroupId").andOn("ugm.isPending", "=", db.raw("?", [false]));
            })
            .where("pm.scope", AccessScope.Project)
            .whereRaw(`"pm"."scopeProjectId" = "ch"."projectId"`)
            .whereRaw(`("pm"."actorUserId" = ${principalIdAsUuid} OR "ugm"."userId" = ${principalIdAsUuid})`);
        });
      });
  };

  const $whereGroupStillInChannelScope = (qb: Knex.QueryBuilder) => {
    const principalIdAsUuid = `"${TableName.AlertChannelRecipient}"."principalId"::uuid`;

    void qb
      .select(db.raw("1"))
      .from({ ch: TableName.AlertChannel })
      .whereRaw(`"ch"."id" = "${TableName.AlertChannelRecipient}"."channelId"`)
      .where((scopeQb) => {
        void scopeQb
          .where((orgScopeQb) => {
            void orgScopeQb.whereNull("ch.projectId").whereExists((groupQb) => {
              void groupQb
                .select(db.raw("1"))
                .from({ g: TableName.Groups })
                .whereRaw(`"g"."id" = ${principalIdAsUuid}`)
                .whereRaw(`"g"."orgId" = "ch"."orgId"`);
            });
          })
          .orWhere((projectScopeQb) => {
            void projectScopeQb.whereNotNull("ch.projectId").whereExists((membershipQb) => {
              void membershipQb
                .select(db.raw("1"))
                .from({ pm: TableName.Membership })
                .where("pm.scope", AccessScope.Project)
                .whereRaw(`"pm"."scopeProjectId" = "ch"."projectId"`)
                .whereRaw(`"pm"."actorGroupId" = ${principalIdAsUuid}`);
            });
          });
      });
  };

  /**
   * Drops recipient rows whose principal can no longer reach the channel's scope, evaluated per
   * (principal, channel) pair. Call it after deleting a membership that can revoke access — losing an
   * org membership also prunes that org's project channels (and its sub-orgs'), losing a project
   * membership prunes only that project's channels.
   *
   * `groupIds` prunes the groups' own rows *and* their members' user rows: the recipient picker offers
   * anyone with access to the project, group-inherited included, so a user row can be backed solely by
   * a group and dies with it. Pass removed users in `userIds` when the group itself keeps its access.
   *
   * Safe to call unconditionally: a principal that still has access keeps its rows, so callers don't
   * have to work out which scopes a change actually touched.
   */
  const pruneOutOfScopeRecipients = async (
    { userIds = [], groupIds = [] }: { userIds?: string[]; groupIds?: string[] },
    tx?: Knex
  ): Promise<number> => {
    try {
      const uniqueUserIds = [...new Set(userIds)];
      const uniqueGroupIds = [...new Set(groupIds)];
      if (!uniqueUserIds.length && !uniqueGroupIds.length) return 0;

      const deletedUserRows = (await (tx || db)(TableName.AlertChannelRecipient)
        .where(`${TableName.AlertChannelRecipient}.principalType`, AlertPrincipalType.USER)
        .where((principalQb) => {
          if (uniqueUserIds.length) {
            void principalQb.whereIn(`${TableName.AlertChannelRecipient}.principalId`, uniqueUserIds);
          }
          if (uniqueGroupIds.length) {
            void principalQb.orWhereIn(
              `${TableName.AlertChannelRecipient}.principalId`,
              (tx || db)(TableName.UserGroupMembership)
                .select(db.raw(`"${TableName.UserGroupMembership}"."userId"::text`))
                .whereIn(`${TableName.UserGroupMembership}.groupId`, uniqueGroupIds)
            );
          }
        })
        .whereNotExists($whereUserStillInChannelScope)
        .del()
        .returning("channelId")) as { channelId: string }[];

      const deletedGroupRows = uniqueGroupIds.length
        ? ((await (tx || db)(TableName.AlertChannelRecipient)
            .where(`${TableName.AlertChannelRecipient}.principalType`, AlertPrincipalType.GROUP)
            .whereIn(`${TableName.AlertChannelRecipient}.principalId`, uniqueGroupIds)
            .whereNotExists($whereGroupStillInChannelScope)
            .del()
            .returning("channelId")) as { channelId: string }[])
        : [];

      const deleted = [...deletedUserRows, ...deletedGroupRows];

      await $disableChannelsWithoutRecipients([...new Set(deleted.map((row) => row.channelId))], tx);

      return deleted.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "PruneOutOfScopeRecipients" });
    }
  };

  return {
    ...alertChannelRecipientOrm,
    findByChannelIds,
    deleteByChannelId,
    deleteByPrincipals,
    pruneOutOfScopeRecipients
  };
};
