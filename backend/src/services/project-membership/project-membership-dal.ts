import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TProjectMembershipDALFactory = ReturnType<typeof projectMembershipDALFactory>;

export const projectMembershipDALFactory = (db: TDbClient) => {
  const projectMemberOrm = ormify(db, TableName.ProjectMembership);

  // special query
  const findAllProjectMembers = async (
    projectId: string,
    filter: { usernames?: string[]; username?: string; id?: string; roles?: string[] } = {}
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.ProjectMembership)
        .where({ [`${TableName.ProjectMembership}.projectId` as "projectId"]: projectId })
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .where((qb) => {
          if (filter.usernames) {
            void qb.whereIn("username", filter.usernames);
          }
          if (filter.username) {
            void qb.where("username", filter.username);
          }
          if (filter.id) {
            void qb.where(`${TableName.ProjectMembership}.id`, filter.id);
          }
          if (filter.roles && filter.roles.length > 0) {
            void qb.whereExists((subQuery) => {
              void subQuery
                .select("role")
                .from(TableName.ProjectUserMembershipRole)
                .leftJoin(
                  TableName.ProjectRoles,
                  `${TableName.ProjectRoles}.id`,
                  `${TableName.ProjectUserMembershipRole}.customRoleId`
                )
                .whereRaw("??.?? = ??.??", [
                  TableName.ProjectUserMembershipRole,
                  "projectMembershipId",
                  TableName.ProjectMembership,
                  "id"
                ])
                .where((subQb) => {
                  void subQb
                    .whereIn(`${TableName.ProjectUserMembershipRole}.role`, filter.roles as string[])
                    .orWhereIn(`${TableName.ProjectRoles}.slug`, filter.roles as string[]);
                });
            });
          }
        })
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .join(
          TableName.ProjectUserMembershipRole,
          `${TableName.ProjectUserMembershipRole}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectUserMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership),
          db.ref("createdAt").withSchema(TableName.ProjectMembership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("id").withSchema(TableName.ProjectUserMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("isTemporary").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("name").as("projectName").withSchema(TableName.Project)
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
          publicKey,
          isGhost,
          id,
          userId,
          projectName,
          createdAt
        }) => ({
          id,
          userId,
          projectId,
          user: { email, username, firstName, lastName, id: userId, publicKey, isGhost },
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
      const ghostUser = await (tx || db.replicaNode())(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
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
        .replicaNode()(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          selectAllTableCols(TableName.ProjectMembership),
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
        .replicaNode()(TableName.ProjectMembership)
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.Users}.id`, userId)
        .where(`${TableName.Project}.orgId`, orgId)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .join(
          TableName.ProjectUserMembershipRole,
          `${TableName.ProjectUserMembershipRole}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectUserMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("id").withSchema(TableName.ProjectUserMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("isTemporary").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.ProjectUserMembershipRole),
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
          projectType
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
      throw new DatabaseError({ error, name: "Find project memberships by user id" });
    }
  };

  return {
    ...projectMemberOrm,
    findAllProjectMembers,
    findProjectGhostUser,
    findMembershipsByUsername,
    findProjectMembershipsByUserId
  };
};
