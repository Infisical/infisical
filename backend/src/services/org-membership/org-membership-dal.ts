import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TOrgMembershipDALFactory = ReturnType<typeof orgMembershipDALFactory>;

export const orgMembershipDALFactory = (db: TDbClient) => {
  const orgMembershipOrm = ormify(db, TableName.OrgMembership);

  const findOrgMembershipById = async (membershipId: string) => {
    try {
      const member = await db
        .replicaNode()(TableName.OrgMembership)
        .where(`${TableName.OrgMembership}.id`, membershipId)
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.OrgMembership),
          db.ref("inviteEmail").withSchema(TableName.OrgMembership),
          db.ref("orgId").withSchema(TableName.OrgMembership),
          db.ref("role").withSchema(TableName.OrgMembership),
          db.ref("roleId").withSchema(TableName.OrgMembership),
          db.ref("status").withSchema(TableName.OrgMembership),
          db.ref("isActive").withSchema(TableName.OrgMembership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey)
        )
        .where({ isGhost: false }) // MAKE SURE USER IS NOT A GHOST USER
        .first();

      if (!member) return undefined;

      const { email, isEmailVerified, username, firstName, lastName, userId, publicKey, ...data } = member;

      return {
        ...data,
        user: { email, isEmailVerified, username, firstName, lastName, id: userId, publicKey }
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org membership by id" });
    }
  };

  return {
    ...orgMembershipOrm,
    findOrgMembershipById
  };
};
