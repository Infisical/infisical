import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectMembershipDALFactory = ReturnType<typeof projectMembershipDALFactory>;

export const projectMembershipDALFactory = (db: TDbClient) => {
  const projectMemberOrm = ormify(db, TableName.ProjectMembership);

  // special query
  const findAllProjectMembers = async (projectId: string) => {
    try {
      const members = await db(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership),
          db.ref("projectId").withSchema(TableName.ProjectMembership),
          db.ref("role").withSchema(TableName.ProjectMembership),
          db.ref("roleId").withSchema(TableName.ProjectMembership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId")
        )
        .where({ isGhost: false });
      return members.map(({ email, firstName, lastName, publicKey, isGhost, ...data }) => ({
        ...data,
        user: { email, firstName, lastName, id: data.userId, publicKey, isGhost }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all project members" });
    }
  };

  const findProjectGhostUser = async (projectId: string) => {
    try {
      const ghostUser = await db(TableName.ProjectMembership)
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

  const findMembershipsByEmail = async (projectId: string, emails: string[]) => {
    try {
      const members = await db(TableName.ProjectMembership)
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
          db.ref("email").withSchema(TableName.Users)
        )
        .whereIn("email", emails)
        .where({ isGhost: false });
      return members.map(({ userId, email, ...data }) => ({
        ...data,
        user: { id: userId, email }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find members by email" });
    }
  };

  return { ...projectMemberOrm, findAllProjectMembers, findProjectGhostUser, findMembershipsByEmail };
};
