import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserGroupMembershipDALFactory = ReturnType<typeof userGroupMembershipDALFactory>;

export const userGroupMembershipDALFactory = (db: TDbClient) => {
  const userGroupMembershipOrm = ormify(db, TableName.UserGroupMembership);

  /**
   * Returns a sub-set of projectIds fed into this function corresponding to projects where either:
   * - The user is a direct member of the project.
   * - The user is a member of a group that is a member of the project, excluding projects that they are part of
   * through the group with id [groupId].
   */
  const filterProjectsByUserMembership = async (userId: string, groupId: string, projectIds: string[], tx?: Knex) => {
    try {
      const userProjectMemberships: string[] = await (tx || db.replicaNode())(TableName.ProjectMembership)
        .where(`${TableName.ProjectMembership}.userId`, userId)
        .whereIn(`${TableName.ProjectMembership}.projectId`, projectIds)
        .pluck(`${TableName.ProjectMembership}.projectId`);

      const userGroupMemberships: string[] = await (tx || db)(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.userId`, userId)
        .whereNot(`${TableName.UserGroupMembership}.groupId`, groupId)
        .join(
          TableName.GroupProjectMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.GroupProjectMembership}.groupId`
        )
        .whereIn(`${TableName.GroupProjectMembership}.projectId`, projectIds)
        .pluck(`${TableName.GroupProjectMembership}.projectId`);

      return new Set(userProjectMemberships.concat(userGroupMemberships));
    } catch (error) {
      throw new DatabaseError({ error, name: "Filter projects by user membership" });
    }
  };

  // special query
  const findUserGroupMembershipsInProject = async (usernames: string[], projectId: string, tx?: Knex) => {
    try {
      const usernameDocs: string[] = await (tx || db.replicaNode())(TableName.UserGroupMembership)
        .join(
          TableName.GroupProjectMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.GroupProjectMembership}.groupId`
        )
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .whereIn(`${TableName.Users}.username`, usernames)
        .pluck(`${TableName.Users}.id`);

      return usernameDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user group members in project" });
    }
  };

  /**
   * Return list of completed/accepted users that are part of the group with id [groupId]
   * that have not yet been added individually to project with id [projectId].
   *
   * Note: Filters out users that are part of other groups in the project.
   * @param groupId
   * @param projectId
   * @returns
   */
  const findGroupMembersNotInProject = async (groupId: string, projectId: string, tx?: Knex) => {
    try {
      // get list of groups in the project with id [projectId]
      // that that are not the group with id [groupId]
      const groups: string[] = await (tx || db.replicaNode())(TableName.GroupProjectMembership)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .whereNot(`${TableName.GroupProjectMembership}.groupId`, groupId)
        .pluck(`${TableName.GroupProjectMembership}.groupId`);

      // main query
      const members = await (tx || db)(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.groupId`, groupId)
        .where(`${TableName.UserGroupMembership}.isPending`, false)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.ProjectMembership, (bd) => {
          bd.on(`${TableName.Users}.id`, "=", `${TableName.ProjectMembership}.userId`).andOn(
            `${TableName.ProjectMembership}.projectId`,
            "=",
            db.raw("?", [projectId])
          );
        })
        .whereNull(`${TableName.ProjectMembership}.userId`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.UserGroupMembership),
          db.ref("groupId").withSchema(TableName.UserGroupMembership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        )
        .where({ isGhost: false }) // MAKE SURE USER IS NOT A GHOST USER
        .whereNotIn(`${TableName.UserGroupMembership}.userId`, (bd) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          bd.select(`${TableName.UserGroupMembership}.userId`)
            .from(TableName.UserGroupMembership)
            .whereIn(`${TableName.UserGroupMembership}.groupId`, groups);
        });

      return members.map(({ email, username, firstName, lastName, userId, publicKey, ...data }) => ({
        ...data,
        user: { email, username, firstName, lastName, id: userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group members not in project" });
    }
  };

  const deletePendingUserGroupMembershipsByUserIds = async (userIds: string[], tx?: Knex) => {
    try {
      const members = await (tx || db)(TableName.UserGroupMembership)
        .whereIn(`${TableName.UserGroupMembership}.userId`, userIds)
        .where(`${TableName.UserGroupMembership}.isPending`, true)
        .join(TableName.Groups, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`);

      await userGroupMembershipOrm.delete(
        {
          $in: {
            userId: userIds
          }
        },
        tx
      );

      return members.map(({ userId, username, groupId, orgId, name, slug, role, roleId }) => ({
        user: {
          id: userId,
          username
        },
        group: {
          id: groupId,
          orgId,
          name,
          slug,
          role,
          roleId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete pending user group memberships by user ids" });
    }
  };

  const findGroupMembershipsByUserIdInOrg = async (userId: string, orgId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.UserGroupMembership)
        .join(TableName.Groups, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(TableName.OrgMembership, `${TableName.UserGroupMembership}.userId`, `${TableName.OrgMembership}.userId`)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.UserGroupMembership}.userId`, userId)
        .where(`${TableName.Groups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.UserGroupMembership),
          db.ref("groupId").withSchema(TableName.UserGroupMembership),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("id").withSchema(TableName.OrgMembership).as("orgMembershipId"),
          db.ref("firstName").withSchema(TableName.Users).as("firstName"),
          db.ref("lastName").withSchema(TableName.Users).as("lastName")
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group memberships by user id in org" });
    }
  };

  const findGroupMembershipsByGroupIdInOrg = async (groupId: string, orgId: string) => {
    try {
      const docs = await db
        .replicaNode()(TableName.UserGroupMembership)
        .join(TableName.Groups, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .join(TableName.OrgMembership, `${TableName.UserGroupMembership}.userId`, `${TableName.OrgMembership}.userId`)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .where(`${TableName.Groups}.id`, groupId)
        .where(`${TableName.Groups}.orgId`, orgId)
        .select(
          db.ref("id").withSchema(TableName.UserGroupMembership),
          db.ref("groupId").withSchema(TableName.UserGroupMembership),
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("id").withSchema(TableName.OrgMembership).as("orgMembershipId"),
          db.ref("firstName").withSchema(TableName.Users).as("firstName"),
          db.ref("lastName").withSchema(TableName.Users).as("lastName")
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group memberships by group id in org" });
    }
  };

  return {
    ...userGroupMembershipOrm,
    filterProjectsByUserMembership,
    findUserGroupMembershipsInProject,
    findGroupMembersNotInProject,
    deletePendingUserGroupMembershipsByUserIds,
    findGroupMembershipsByUserIdInOrg,
    findGroupMembershipsByGroupIdInOrg
  };
};
