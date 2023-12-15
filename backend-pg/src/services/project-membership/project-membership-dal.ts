import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectMembershipDalFactory = ReturnType<typeof projectMembershipDalFactory>;

export const projectMembershipDalFactory = (db: TDbClient) => {
  const projectMemberOrm = ormify(db, TableName.ProjectMembership);

  // special query
  const findAllProjectMembers = async (projectId: string) => {
    try {
      const members = await db(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership),
          db.ref("projectId").withSchema(TableName.ProjectMembership),
          db.ref("role").withSchema(TableName.ProjectMembership),
          db.ref("roleId").withSchema(TableName.ProjectMembership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        );
      return members.map(({ email, firstName, lastName, publicKey, ...data }) => ({
        ...data,
        user: { email, firstName, lastName, id: data.userId, publicKey }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all project members" });
    }
  };

  return { ...projectMemberOrm, findAllProjectMembers };
};
