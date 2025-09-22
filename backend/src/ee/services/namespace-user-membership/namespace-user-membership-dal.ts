import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TNamespaceUserMembershipDALFactory = ReturnType<typeof namespaceUserMembershipDALFactory>;

export const namespaceUserMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NamespaceMembership);

  const findMembershipsByUsername = async (namespaceId: string, usernames: string[]) => {
    try {
      const members = await db
        .replicaNode()(TableName.NamespaceMembership)
        .where({ [`${TableName.NamespaceMembership}.namespaceId` as "namespaceId"]: namespaceId })
        .whereNotNull(`${TableName.NamespaceMembership}.orgUserMembershipId` as "orgUserMembershipId")
        .join(
          TableName.OrgMembership,
          `${TableName.NamespaceMembership}.orgUserMembershipId`,
          `${TableName.OrgMembership}.id`
        )
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.NamespaceMembership))
        .select(db.ref("id").withSchema(TableName.Users).as("userId"), db.ref("username").withSchema(TableName.Users))
        .whereIn("username", usernames)
        .where({ isGhost: false });

      return members.map(({ userId, username, ...data }) => ({
        ...data,
        user: { id: userId, username }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find namespace members by email" });
    }
  };

  const findAllMembers = async (
    namespaceId: string,
    filter: {
      usernames?: string[];
      username?: string;
      id?: string;
      roles?: string[];
      limit?: number;
      offset?: number;
    } = {}
  ) => {
    try {
      const docs = await db
        .replicaNode()(TableName.NamespaceMembership)
        .where({ [`${TableName.NamespaceMembership}.namespaceId` as "namespaceId"]: namespaceId })
        // only pull user memberships
        .whereNotNull(`${TableName.NamespaceMembership}.orgUserMembershipId` as "orgUserMembershipId")
        .join(TableName.Namespace, `${TableName.NamespaceMembership}.namespaceId`, `${TableName.Namespace}.id`)
        .join(
          TableName.OrgMembership,
          `${TableName.NamespaceMembership}.orgUserMembershipId`,
          `${TableName.OrgMembership}.id`
        )
        .join(TableName.Users, `${TableName.OrgMembership}.userId`, `${TableName.Users}.id`)
        .where((qb) => {
          if (filter.usernames) {
            void qb.whereIn("username", filter.usernames);
          }
          if (filter.username) {
            void qb.where("username", filter.username);
          }
          if (filter.id) {
            void qb.where(`${TableName.NamespaceMembership}.id`, filter.id);
          }
          if (filter.roles && filter.roles.length > 0) {
            void qb.whereExists((subQuery) => {
              void subQuery
                .select("role")
                .from(TableName.NamespaceMembershipRole)
                .leftJoin(
                  TableName.NamespaceRole,
                  `${TableName.NamespaceRole}.id`,
                  `${TableName.NamespaceMembershipRole}.customRoleId`
                )
                .whereRaw("??.?? = ??.??", [
                  TableName.NamespaceMembershipRole,
                  "namespaceMembershipId",
                  TableName.NamespaceMembership,
                  "id"
                ])
                .where((subQb) => {
                  void subQb
                    .whereIn(`${TableName.NamespaceMembershipRole}.role`, filter.roles as string[])
                    .orWhereIn(`${TableName.NamespaceRole}.slug`, filter.roles as string[]);
                });
            });
          }
        })
        .join(
          TableName.NamespaceMembershipRole,
          `${TableName.NamespaceMembershipRole}.namespaceMembershipId`,
          `${TableName.NamespaceMembership}.id`
        )
        .leftJoin(
          TableName.NamespaceRole,
          `${TableName.NamespaceMembershipRole}.customRoleId`,
          `${TableName.NamespaceRole}.id`
        )
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Users}.id`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.OrgMembership}.orgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .select(
          db.ref("id").withSchema(TableName.NamespaceMembership),
          db.ref("createdAt").withSchema(TableName.NamespaceMembership),
          db.ref("updatedAt").withSchema(TableName.NamespaceMembership),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("isEmailVerified").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.NamespaceMembershipRole),
          db.ref("id").withSchema(TableName.NamespaceMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.NamespaceMembershipRole),
          db.ref("name").withSchema(TableName.NamespaceRole).as("customRoleName"),
          db.ref("slug").withSchema(TableName.NamespaceRole).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.NamespaceMembershipRole),
          db.ref("isTemporary").withSchema(TableName.NamespaceMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.NamespaceMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.NamespaceMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.NamespaceMembershipRole),
          db.ref("name").as("namespaceName").withSchema(TableName.Namespace),
          db.ref("isActive").withSchema(TableName.OrgMembership),
          db.ref("lastLoginAuthMethod").withSchema(TableName.OrgMembership),
          db.ref("lastLoginTime").withSchema(TableName.OrgMembership),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
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
          id,
          userId,
          namespaceName,
          createdAt,
          isActive,
          updatedAt,
          isEmailVerified,
          lastLoginAuthMethod,
          lastLoginTime
        }) => ({
          id,
          userId,
          namespaceId,
          lastLoginAuthMethod,
          lastLoginTime,
          user: {
            email,
            username,
            firstName,
            lastName,
            id: userId,
            isEmailVerified,
            isOrgMembershipActive: isActive
          },
          namespace: {
            id: namespaceId,
            name: namespaceName
          },
          createdAt,
          updatedAt
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
          },
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
      return members.map((el) => ({
        ...el,
        roles: el.roles.sort((a, b) => {
          const roleA = (a.customRoleName || a.role).toLowerCase();
          const roleB = (b.customRoleName || b.role).toLowerCase();
          return roleA.localeCompare(roleB);
        })
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all namespace members" });
    }
  };

  return {
    ...orm,
    findAllMembers,
    findMembershipsByUsername
  };
};
