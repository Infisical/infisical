import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserGroupMembershipDALFactory = ReturnType<typeof userGroupMembershipDALFactory>;

export const userGroupMembershipDALFactory = (db: TDbClient) => {
  const userGroupMembershipOrm = ormify(db, TableName.UserGroupMembership);

  // special query
  const findGroupMembersInProject = async (groupId: string, projectId: string) => {
    try {
      const members = await db(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.groupId`, groupId)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .join(TableName.ProjectMembership, function () {
          this.on(`${TableName.Users}.id`, "=", `${TableName.ProjectMembership}.userId`).andOn(
            `${TableName.ProjectMembership}.projectId`,
            "=",
            db.raw("?", [projectId])
          );
        })
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
        .where({ isGhost: false }); // MAKE SURE USER IS NOT A GHOST USER

      return members.map(({ email, username, firstName, lastName, userId, publicKey, ...data }) => ({
        ...data,
        user: { email, username, firstName, lastName, id: userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find group members in project" });
    }
  };

  /**
   * Return list of users that are part of the group with id [groupId]
   * that have not yet been added individually to project with id [projectId].
   *
   * Filters out users that are part of other groups in the project.
   * @param groupId
   * @param projectId
   * @returns
   */
  const findGroupMembersNotInProject = async (groupId: string, projectId: string) => {
    try {
      // get list of groups in the project with id [projectId]
      // that that are not the group with id [groupId]
      const groups: string[] = await db(TableName.GroupProjectMembership)
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .whereNot(`${TableName.GroupProjectMembership}.groupId`, groupId)
        .pluck(`${TableName.GroupProjectMembership}.groupId`);

      // main query
      const members = await db(TableName.UserGroupMembership)
        .where(`${TableName.UserGroupMembership}.groupId`, groupId)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin(TableName.ProjectMembership, function () {
          this.on(`${TableName.Users}.id`, "=", `${TableName.ProjectMembership}.userId`).andOn(
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
        .whereNotIn(`${TableName.UserGroupMembership}.userId`, function () {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.select(`${TableName.UserGroupMembership}.userId`)
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

  return {
    ...userGroupMembershipOrm,
    findGroupMembersInProject,
    findGroupMembersNotInProject
  };
};
