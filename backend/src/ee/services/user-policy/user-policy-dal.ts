import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TUserPolicyDALFactory = ReturnType<typeof userPolicyDALFactory>;

export const userPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.UserPolicy);

  // Which of these users can reach the project, counting group membership. A user who is only in the
  // project through a group is still a member, so a direct-membership check alone would reject them.
  const findProjectMemberUserIds = async (projectId: string, userIds: string[]) => {
    if (!userIds.length) return [];
    try {
      const rows = await db
        .replicaNode()(TableName.Membership)
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.Membership}.actorGroupId`
        )
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .where(`${TableName.Membership}.isActive`, true)
        .where((qb) => {
          void qb
            .whereIn(`${TableName.Membership}.actorUserId`, userIds)
            .orWhereIn(`${TableName.UserGroupMembership}.userId`, userIds);
        })
        .select(
          db.ref("actorUserId").withSchema(TableName.Membership),
          db.ref("userId").withSchema(TableName.UserGroupMembership).as("groupUserId")
        );

      const found = new Set<string>();
      rows.forEach((row) => {
        if (row.actorUserId && userIds.includes(row.actorUserId)) found.add(row.actorUserId);
        const groupUserId = row.groupUserId as string | null;
        if (groupUserId && userIds.includes(groupUserId)) found.add(groupUserId);
      });
      return [...found];
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.UserPolicy}: FindProjectMemberUserIds` });
    }
  };

  const findByUser = async (projectId: string, userId: string) => {
    try {
      return await db
        .replicaNode()(TableName.UserPolicy)
        .join(TableName.UserPolicyUser, `${TableName.UserPolicyUser}.policyId`, `${TableName.UserPolicy}.id`)
        .where(`${TableName.UserPolicy}.projectId`, projectId)
        .where(`${TableName.UserPolicyUser}.userId`, userId)
        .select(selectAllTableCols(TableName.UserPolicy));
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.UserPolicy}: FindByUser` });
    }
  };

  return { ...orm, findByUser, findProjectMemberUserIds };
};

export type TUserPolicyUserDALFactory = ReturnType<typeof userPolicyUserDALFactory>;

export const userPolicyUserDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.UserPolicyUser);

  const findByPolicyIds = async (policyIds: string[]) => {
    if (!policyIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.UserPolicyUser)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.UserPolicyUser}.userId`)
        .whereIn(`${TableName.UserPolicyUser}.policyId`, policyIds)
        .select(selectAllTableCols(TableName.UserPolicyUser))
        .select(
          db.ref("username").withSchema(TableName.Users).as("username"),
          db.ref("email").withSchema(TableName.Users).as("email"),
          db.ref("firstName").withSchema(TableName.Users).as("firstName"),
          db.ref("lastName").withSchema(TableName.Users).as("lastName")
        );
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.UserPolicyUser}: FindByPolicyIds` });
    }
  };

  return { ...orm, findByPolicyIds };
};

export type TUserPolicyRuleDALFactory = ReturnType<typeof userPolicyRuleDALFactory>;

export const userPolicyRuleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.UserPolicyRule);

  const findByPolicyIds = async (policyIds: string[]) => {
    if (!policyIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.UserPolicyRule)
        .whereIn("policyId", policyIds)
        .select(selectAllTableCols(TableName.UserPolicyRule))
        .orderBy("createdAt", "asc");
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.UserPolicyRule}: FindByPolicyIds` });
    }
  };

  return { ...orm, findByPolicyIds };
};
