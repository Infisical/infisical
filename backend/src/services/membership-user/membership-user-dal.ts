import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { MembershipsSchema } from "@app/db/schemas/memberships";
import { AccessScope, AccessScopeData, TableName } from "@app/db/schemas/models";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";

export type TMembershipUserDALFactory = ReturnType<typeof membershipUserDALFactory>;

type TFindUserArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  filter: Partial<{
    limit: number;
    offset: number;
    userId?: string;
    username: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

type TGetUserByIdArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  userId: string;
};

export const membershipUserDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);

  const getUserById = async ({ scopeData, tx, userId }: TGetUserByIdArg) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder
            .on(`${TableName.Membership}.actorUserId`, `${TableName.IdentityMetadata}.userId`)
            .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
        })
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where(`${TableName.Membership}.actorUserId`, userId)
        .where(`${TableName.Users}.isGhost`, false)
        .where((qb) => {
          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Namespace) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
              .where(`${TableName.Membership}.scopeNamespaceId`, scopeData.namespaceId);
          } else if (scopeData.scope === AccessScope.Project) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Project)
              .where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        })
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("id").withSchema(TableName.Role).as("customRoleId"),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole).as("membershipRole"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole).as("membershipRoleIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.MembershipRole).as("membershipRoleCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt"),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("id").withSchema(TableName.Users).as("userId")
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...MembershipsSchema.parse(el),
          user: {
            username: el.userUsername,
            email: el.userEmail,
            firstName: el.userFirstName,
            lastName: el.userLastName,
            id: el.userId
          }
        }),
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              customRoleSlug,
              customRoleName,
              customRoleId,
              membershipRoleId,
              membershipRole,
              membershipRoleIsTemporary,
              membershipRoleTemporaryMode,
              membershipRoleTemporaryRange,
              membershipRoleTemporaryAccessEndTime,
              membershipRoleTemporaryAccessStartTime,
              membershipRoleCreatedAt,
              membershipRoleUpdatedAt
            }) => ({
              id: membershipRoleId,
              role: membershipRole,
              customRoleSlug,
              customRoleName,
              customRoleId,
              temporaryRange: membershipRoleTemporaryRange,
              temporaryMode: membershipRoleTemporaryMode,
              temporaryAccessStartTime: membershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: membershipRoleTemporaryAccessEndTime,
              isTemporary: membershipRoleIsTemporary,
              createdAt: membershipRoleCreatedAt,
              updatedAt: membershipRoleUpdatedAt
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

      return data?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "MembershipGetByUserId" });
    }
  };

  const findUsers = async ({ scopeData, tx, filter }: TFindUserArg) => {
    try {
      const paginatedUsers = (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where(`${TableName.Users}.isGhost`, false)
        .where((qb) => {
          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Namespace) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Namespace)
              .where(`${TableName.Membership}.scopeNamespaceId`, scopeData.namespaceId);
          } else if (scopeData.scope === AccessScope.Project) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Project)
              .where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        });

      if (filter.limit) void paginatedUsers.limit(filter.limit);
      if (filter.offset) void paginatedUsers.offset(filter.offset);

      if (filter.username || filter.role) {
        buildKnexFilterForSearchResource(
          paginatedUsers,
          {
            username: filter.username!,
            role: filter.role!
          },
          (attr) => {
            switch (attr) {
              case "role":
                return [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`];
              case "username":
                return `${TableName.Users}.username`;
              default:
                throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
            }
          }
        );
      }

      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .whereIn(`${TableName.Membership}.id`, paginatedUsers)
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("slug").withSchema(TableName.Role).as("customRoleSlug"),
          db.ref("name").withSchema(TableName.Role).as("customRoleName"),
          db.ref("id").withSchema(TableName.Role).as("customRoleId"),
          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole).as("membershipRole"),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryMode"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole).as("membershipRoleIsTemporary"),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole).as("membershipRoleTemporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessStartTime"),
          db
            .ref("temporaryAccessEndTime")
            .withSchema(TableName.MembershipRole)
            .as("membershipRoleTemporaryAccessEndTime"),
          db.ref("createdAt").withSchema(TableName.MembershipRole).as("membershipRoleCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt"),
          db.ref("username").withSchema(TableName.Users).as("userUsername"),
          db.ref("email").withSchema(TableName.Users).as("userEmail"),
          db.ref("firstName").withSchema(TableName.Users).as("userFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("userLastName"),
          db.ref("id").withSchema(TableName.Users).as("userId")
        )
        .select(
          db.raw(
            `count(${TableName.Membership}."actorUserId") OVER(PARTITION BY ${TableName.Membership}."scopeOrgId") as total`
          )
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => ({
          ...MembershipsSchema.parse(el),
          user: {
            username: el.userUsername,
            email: el.userEmail,
            firstName: el.userFirstName,
            lastName: el.userLastName,
            id: el.userId
          }
        }),
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              customRoleSlug,
              customRoleName,
              customRoleId,
              membershipRoleId,
              membershipRole,
              membershipRoleIsTemporary,
              membershipRoleTemporaryMode,
              membershipRoleTemporaryRange,
              membershipRoleTemporaryAccessEndTime,
              membershipRoleTemporaryAccessStartTime,
              membershipRoleCreatedAt,
              membershipRoleUpdatedAt
            }) => ({
              id: membershipRoleId,
              role: membershipRole,
              customRoleSlug,
              customRoleName,
              customRoleId,
              temporaryRange: membershipRoleTemporaryRange,
              temporaryMode: membershipRoleTemporaryMode,
              temporaryAccessStartTime: membershipRoleTemporaryAccessStartTime,
              temporaryAccessEndTime: membershipRoleTemporaryAccessEndTime,
              isTemporary: membershipRoleIsTemporary,
              createdAt: membershipRoleCreatedAt,
              updatedAt: membershipRoleUpdatedAt
            })
          }
        ]
      });
      return { data, totalCount: Number((data?.[0] as unknown as { total: number })?.total ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "MembershipfindUser" });
    }
  };

  // this right now only support sub organization
  const listAvailableUsers = async (orgId: string, rootOrgId: string) => {
    try {
      const usersConnectedToOrg = db
        .replicaNode()(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .select("actorUserId");

      const docs = await db
        .replicaNode()(TableName.Membership)
        .join(TableName.Users, `${TableName.Users}.id`, `${TableName.Membership}.actorUserId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Users}.isGhost`, false)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .where(`${TableName.Membership}.scopeOrgId`, rootOrgId)
        .whereNotIn(`${TableName.Membership}.actorUserId`, usersConnectedToOrg)
        .select(
          db.ref("id").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users)
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "ListAvailableUsers" });
    }
  };

  return { ...orm, findUsers, getUserById, listAvailableUsers };
};
