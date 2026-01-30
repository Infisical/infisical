import { TDbClient } from "@app/db";
import { AccessScope, TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sqlNestRelationships } from "@app/lib/knex";

export type TOrgMembershipDALFactory = ReturnType<typeof orgMembershipDALFactory>;

export const orgMembershipDALFactory = (db: TDbClient) => {
  const findOrgMembershipById = async (membershipId: string) => {
    try {
      const member = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.id`, membershipId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.Role}.id`, `${TableName.MembershipRole}.customRoleId`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Membership}.actorUserId`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("inviteEmail").withSchema(TableName.Membership),
          db.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("status").withSchema(TableName.Membership),
          db.ref("isActive").withSchema(TableName.Membership),
          db.ref("lastLoginAuthMethod").withSchema(TableName.Membership),
          db.ref("lastLoginTime").withSchema(TableName.Membership),
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
          customRoleSlug,
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
          inviteEmail,
          lastLoginAuthMethod,
          lastLoginTime
        }) => ({
          roleId,
          orgId,
          id,
          role,
          customRoleSlug,
          status,
          isActive,
          inviteEmail,
          lastLoginAuthMethod,
          lastLoginTime,
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

      const reminderScheduleDays = [1, 3, 7, 14, 21, 30];

      const memberships = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where("status", "invited")
        .where((qb) => {
          for (let i = 0; i < reminderScheduleDays.length; i += 1) {
            const currentSlotDays = reminderScheduleDays[i];
            const nextSlotDays = reminderScheduleDays[i + 1];

            const slotStartDate = new Date(now.getTime() - currentSlotDays * 24 * 60 * 60 * 1000);
            const slotEndDate = nextSlotDays
              ? new Date(now.getTime() - nextSlotDays * 24 * 60 * 60 * 1000)
              : new Date(now.getTime() - (currentSlotDays + 1) * 24 * 60 * 60 * 1000);

            void qb.orWhere((qbInner) => {
              void qbInner.where(`${TableName.Membership}.createdAt`, "<=", slotStartDate);
              void qbInner.where(`${TableName.Membership}.createdAt`, ">", slotEndDate);

              void qbInner.andWhere((qbLastInvited) => {
                void qbLastInvited.whereNull(`${TableName.Membership}.lastInvitedAt`);
                void qbLastInvited.orWhere(`${TableName.Membership}.lastInvitedAt`, "<", slotStartDate);
              });
            });
          }
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
      await db(TableName.Membership)
        .whereIn("id", membershipIds)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .update({ lastInvitedAt: new Date() });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Update last invited at by ids"
      });
    }
  };

  const findOrgMembershipsWithUsersByOrgId = async (orgId: string) => {
    try {
      const members = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Membership}.actorUserId`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("inviteEmail").withSchema(TableName.Membership),
          db.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("customRoleId"),
          db.ref("status").withSchema(TableName.Membership),
          db.ref("isActive").withSchema(TableName.Membership),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId")
        )
        .where({ isGhost: false });

      return members.map((member) => ({
        id: member.id,
        orgId: member.orgId,
        role: member.role,
        status: member.status,
        isActive: member.isActive,
        inviteEmail: member.inviteEmail,
        user: {
          id: member.userId,
          email: member.email,
          username: member.username,
          firstName: member.firstName,
          lastName: member.lastName
        }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org memberships with users by org id" });
    }
  };

  return {
    findOrgMembershipById,
    findRecentInvitedMemberships,
    updateLastInvitedAtByIds,
    findOrgMembershipsWithUsersByOrgId
  };
};
