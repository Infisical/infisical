import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

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
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.OrgMembership}.userId`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.OrgMembership}.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })
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
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        )
        .where({ isGhost: false }); // MAKE SURE USER IS NOT A GHOST USER

      if (!member) return undefined;

      const doc = sqlNestRelationships({
        data: member,
        key: "id",
        parentMapper: ({
          email,
          isEmailVerified,
          username,
          firstName,
          lastName,
          userId,
          publicKey,
          roleId,
          orgId,
          id,
          role,
          status,
          isActive,
          inviteEmail
        }) => ({
          roleId,
          orgId,
          id,
          role,
          status,
          isActive,
          inviteEmail,
          user: {
            id: userId,
            email,
            isEmailVerified,
            username,
            firstName,
            lastName,
            userId,
            publicKey
          }
        }),
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataKey, metadataValue, metadataId }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue
            })
          }
        ]
      });

      return doc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org membership by id" });
    }
  };

  const findRecentInvitedMemberships = async () => {
    try {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      const memberships = await db
        .replicaNode()(TableName.OrgMembership)
        .where("status", "invited")
        .where((qb) => {
          // lastInvitedAt is null AND createdAt is between 1 week and 3 months ago
          void qb
            .whereNull(`${TableName.OrgMembership}.lastInvitedAt`)
            .whereBetween(`${TableName.OrgMembership}.createdAt`, [threeMonthsAgo, oneWeekAgo]);
        })
        .orWhere((qb) => {
          // lastInvitedAt is older than 1 week ago AND createdAt is younger than 1 month ago
          void qb
            .where(`${TableName.OrgMembership}.lastInvitedAt`, "<", oneWeekAgo)
            .where(`${TableName.OrgMembership}.createdAt`, ">", oneMonthAgo);
        });

      return memberships;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find recent invited memberships"
      });
    }
  };

  const updateLastInvitedAtByIds = async (membershipIds: string[]) => {
    try {
      if (membershipIds.length === 0) return;
      await db(TableName.OrgMembership).whereIn("id", membershipIds).update({ lastInvitedAt: new Date() });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Update last invited at by ids"
      });
    }
  };

  return {
    ...orgMembershipOrm,
    findOrgMembershipById,
    findRecentInvitedMemberships,
    updateLastInvitedAtByIds
  };
};
