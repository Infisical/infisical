import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TMemberships } from "@app/db/schemas/memberships";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { TUserEncryptionKeys } from "@app/db/schemas/user-encryption-keys";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TProjectMembershipDALFactory = ReturnType<typeof projectMembershipDALFactory>;

export const projectMembershipDALFactory = (db: TDbClient) => {
  // special query
  const findAllProjectMembers = async (
    projectId: string,
    filter: { usernames?: string[]; username?: string; id?: string; roles?: string[] } = {}
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Membership)
        .where({ [`${TableName.Membership}.scopeProjectId` as "scopeProjectId"]: projectId })
        .where({ [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join<TMemberships>(db(TableName.Membership).as("orgMembership"), (qb) => {
          qb.on(`${TableName.Users}.id`, "=", `orgMembership.actorUserId`)
            .andOn(`orgMembership.scopeOrgId`, "=", `${TableName.Project}.orgId`)
            .andOn("orgMembership.scope", db.raw("?", [AccessScope.Organization]));
        })
        .where((qb) => {
          if (filter.usernames) {
            void qb.whereIn("username", filter.usernames);
          }
          if (filter.username) {
            void qb.where("username", filter.username);
          }
          if (filter.id) {
            void qb.where(`${TableName.Membership}.id`, filter.id);
          }
          if (filter.roles && filter.roles.length > 0) {
            void qb.whereExists((subQuery) => {
              void subQuery
                .select("role")
                .from(TableName.MembershipRole)
                .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
                .whereRaw("??.?? = ??.??", [TableName.MembershipRole, "membershipId", TableName.Membership, "id"])
                .where((subQb) => {
                  void subQb
                    .whereIn(`${TableName.MembershipRole}.role`, filter.roles as string[])
                    .orWhereIn(`${TableName.Role}.slug`, filter.roles as string[]);
                });
            });
          }
        })
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.MembershipRole),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("isActive").withSchema("orgMembership")
        )
        .where({ isGhost: false })
        .orderBy(`${TableName.Users}.username` as "username");

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({
          email,
          firstName,
          username,
          lastName,
          isGhost,
          id,
          userId,
          projectName,
          createdAt,
          isActive
        }) => ({
          id,
          userId,
          projectId,
          user: {
            email,
            username,
            firstName,
            lastName,
            id: userId,
            // akhilmhdh: if we do user encryption based join this would fail for scim user who haven't logged in yet
            // public key is not used anymore as well
            publicKey: "",
            isGhost,
            isOrgMembershipActive: isActive
          },
          project: {
            id: projectId,
            name: projectName
          },
          createdAt
        }),
        key: "id",
        childrenMapper: [
          {
            label: "roles" as const,
            key: "membershipRoleId",
            mapper: ({
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              membershipRoleId,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            })
          }
        ]
      });
      return members.map((el) => ({
        ...el,
        roles: el.roles.sort((a, b) => {
          const roleA = (a.customRoleName || a.role).toLowerCase();
          const roleB = (b.customRoleName || b.role).toLowerCase();
          return roleA.localeCompare(roleB);
        })
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all project members" });
    }
  };

  const findProjectGhostUser = async (projectId: string, tx?: Knex) => {
    try {
      const ghostUser = await (tx || db.replicaNode())(TableName.Membership)
        .where({ [`${TableName.Membership}.scopeProjectId` as "scopeProjectId"]: projectId })
        .where({ [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .where({ isGhost: true })
        .first();

      return ghostUser;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project top-level user" });
    }
  };

  const findMembershipsByUsername = async (projectId: string, usernames: string[]) => {
    try {
      const members = await db
        .replicaNode()(TableName.Membership)
        .where({ [`${TableName.Membership}.scopeProjectId` as "scopeProjectId"]: projectId })
        .where({ [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          selectAllTableCols(TableName.Membership),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("username").withSchema(TableName.Users)
        )
        .whereIn("username", usernames)
        .where({ isGhost: false });

      return members.map(({ userId, username, ...data }) => ({
        ...data,
        user: { id: userId, username }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find members by email" });
    }
  };

  const findProjectMembershipsByUserId = async (orgId: string, userId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Membership)
        .where({ [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.id`, userId)
        .where(`${TableName.Project}.orgId`, orgId)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.MembershipRole),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("id").as("projectId").withSchema(TableName.Project),
          db.ref("type").as("projectType").withSchema(TableName.Project)
        )
        .where({ isGhost: false });

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ email, firstName, username, lastName, isGhost, id, projectId, projectName, projectType }) => ({
          id,
          userId,
          projectId,
          user: {
            email,
            username,
            firstName,
            lastName,
            id: userId,
            isGhost,
            // akhilmhdh: if we do user encryption based join this would fail for scim user who haven't logged in yet
            // public key is not used anymore as well
            publicKey: ""
          },
          project: {
            id: projectId,
            name: projectName,
            type: projectType
          }
        }),
        key: "id",
        childrenMapper: [
          {
            label: "roles" as const,
            key: "membershipRoleId",
            mapper: ({
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              membershipRoleId,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            })
          }
        ]
      });
      return members;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project memberships by user id" });
    }
  };

  const findProjectMembershipsByUserIds = async (orgId: string, userIds: string[]) => {
    try {
      const docs = await db
        .replicaNode()(TableName.Membership)
        .where({ [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .whereIn(`${TableName.Users}.id`, userIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.MembershipRole),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("id").as("projectId").withSchema(TableName.Project),
          db.ref("type").as("projectType").withSchema(TableName.Project)
        )
        .where({ isGhost: false });

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({
          email,
          firstName,
          username,
          lastName,
          publicKey,
          isGhost,
          id,
          projectId,
          projectName,
          projectType,
          userId
        }) => ({
          id,
          userId,
          projectId,
          user: { email, username, firstName, lastName, id: userId, publicKey, isGhost },
          project: {
            id: projectId,
            name: projectName,
            type: projectType
          }
        }),
        key: "id",
        childrenMapper: [
          {
            label: "roles" as const,
            key: "membershipRoleId",
            mapper: ({
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              membershipRoleId,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            })
          }
        ]
      });
      return members;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project memberships by user ids" });
    }
  };

  return {
    findAllProjectMembers,
    findProjectGhostUser,
    findMembershipsByUsername,
    findProjectMembershipsByUserId,
    findProjectMembershipsByUserIds
  };
};
