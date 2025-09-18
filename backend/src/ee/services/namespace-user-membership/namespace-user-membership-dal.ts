import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

export type TNamespaceUserMembershipDALFactory = ReturnType<typeof namespaceUserMembershipDALFactory>;

export const namespaceUserMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NamespaceMembership);

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
        .where({ [`${TableName.NamespaceMembership}.namespaceid` as "namespaceId"]: namespaceId })
        // only pull user memberships
        .whereNotNull(`${TableName.NamespaceMembership}.orgUserMembershipId` as "orgUserMembershipId")
        .join(TableName.Namespace, `${TableName.NamespaceMembership}.namespaceId`, `${TableName.Namespace}.id`)
        .join(TableName.OrgMembership, `${TableName.Namespace}.orgId`, `${TableName.OrgMembership}.orgId`)
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
                  "projectMembershipId",
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
        .select(
          db.ref("id").withSchema(TableName.NamespaceMembership),
          db.ref("createdAt").withSchema(TableName.NamespaceMembership),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
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
          db.ref("isActive").withSchema(TableName.OrgMembership)
        )
        .where({ isGhost: false })
        .orderBy(`${TableName.Users}.username` as "username");

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ email, firstName, username, lastName, id, userId, namespaceName, createdAt, isActive }) => ({
          id,
          userId,
          namespaceId,
          user: {
            email,
            username,
            firstName,
            lastName,
            id: userId,
            isOrgMembershipActive: isActive
          },
          namespace: {
            id: namespaceId,
            name: namespaceName
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

  return {
    ...orm,
    findAllMembers
  };
};
