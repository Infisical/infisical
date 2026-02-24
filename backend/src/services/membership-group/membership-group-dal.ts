import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, AccessScopeData, MembershipsSchema, TableName, TGroups } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";

export type TMembershipGroupDALFactory = ReturnType<typeof membershipGroupDALFactory>;

type TFindGroupArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  filter: Partial<{
    limit: number;
    offset: number;
    groupId: string;
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

type TGetGroupByIdArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  groupId: string;
};

export const membershipGroupDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);

  const getGroupById = async ({ scopeData, tx, groupId }: TGetGroupByIdArg) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .join(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where(`${TableName.Membership}.actorGroupId`, groupId)
        .where((qb) => {
          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Project) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Project)
              .where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        })
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
          db.ref("orgId").withSchema(TableName.Groups).as("groupOrgId"),
          db.ref("createdAt").withSchema(TableName.Groups).as("groupCreatedAt"),
          db.ref("updatedAt").withSchema(TableName.Groups).as("groupUpdatedAt"),
          db.ref("slug").withSchema(TableName.Role).as("roleSlug"),
          db.ref("name").withSchema(TableName.Role).as("roleName"),
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
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt")
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => {
          const { groupName, groupSlug, groupOrgId, groupCreatedAt, groupUpdatedAt } = el;
          return {
            ...MembershipsSchema.parse(el),
            group: {
              id: groupId,
              name: groupName,
              slug: groupSlug,
              orgId: groupOrgId,
              createdAt: groupCreatedAt,
              updatedAt: groupUpdatedAt
            } as TGroups
          };
        },
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              roleSlug,
              roleName,
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
              customRoleSlug: roleSlug,
              customRoleName: roleName,
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

      return data?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "MembershipGetByGroupId" });
    }
  };

  const findGroups = async ({ scopeData, tx, filter }: TFindGroupArg) => {
    try {
      const paginatedGroups = (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .join(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where((qb) => {
          if (filter.groupId) {
            void qb.where(`${TableName.Groups}.id`, filter.groupId);
          }

          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scope`, AccessScope.Organization);
          } else if (scopeData.scope === AccessScope.Project) {
            void qb
              .where(`${TableName.Membership}.scope`, AccessScope.Project)
              .where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        });

      if (filter.limit) void paginatedGroups.limit(filter.limit);
      if (filter.offset) void paginatedGroups.offset(filter.offset);

      if (filter.name || filter.role) {
        buildKnexFilterForSearchResource(
          paginatedGroups,
          {
            name: filter.name!,
            role: filter.role!
          },
          (attr) => {
            switch (attr) {
              case "role":
                return [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`];
              case "name":
                return `${TableName.Groups}.name`;
              default:
                throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
            }
          }
        );
      }

      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorGroupId`)
        .join(TableName.Groups, `${TableName.Groups}.id`, `${TableName.Membership}.actorGroupId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .whereIn(`${TableName.Membership}.id`, paginatedGroups)
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("name").withSchema(TableName.Groups).as("groupName"),
          db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
          db.ref("id").withSchema(TableName.Groups).as("groupId"),
          db.ref("orgId").withSchema(TableName.Groups).as("groupOrgId"),

          db.ref("slug").withSchema(TableName.Role).as("roleSlug"),
          db.ref("name").withSchema(TableName.Role).as("roleName"),
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
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt")
        )
        .select(
          db.raw(
            `count(${TableName.Membership}."actorGroupId") OVER(PARTITION BY ${TableName.Membership}."scopeOrgId") as total`
          )
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => {
          const { groupId, groupName, groupSlug, groupOrgId } = el;
          return {
            ...MembershipsSchema.parse(el),
            group: {
              id: groupId,
              name: groupName,
              slug: groupSlug,
              ...(groupOrgId != null && { orgId: groupOrgId })
            }
          };
        },
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              roleSlug,
              roleName,
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
              customRoleSlug: roleSlug,
              customRoleName: roleName,
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
      throw new DatabaseError({ error, name: "MembershipfindGroup" });
    }
  };

  type TFindEffectiveInOrgArg = {
    scopeOrgId: string;
    excludeMembershipIds: string[];
    userIds: string[];
    identityIds: string[];
    groupIds: string[];
    tx?: Knex;
  };

  /**
   * Find all memberships in an org that grant access to the given actors (users, identities, or groups).
   * Used to determine which actors still have at least one membership after excluding some (e.g. when unlinking a group).
   */
  const findEffectiveInOrg = async ({
    scopeOrgId,
    excludeMembershipIds,
    userIds,
    identityIds,
    groupIds,
    tx
  }: TFindEffectiveInOrgArg) => {
    try {
      if (userIds.length === 0 && identityIds.length === 0 && groupIds.length === 0) {
        return [];
      }

      const qb = (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scopeOrgId`, scopeOrgId)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where((inner) => {
          if (userIds.length > 0) void inner.orWhereIn(`${TableName.Membership}.actorUserId`, userIds);
          if (identityIds.length > 0) void inner.orWhereIn(`${TableName.Membership}.actorIdentityId`, identityIds);
          if (groupIds.length > 0) void inner.orWhereIn(`${TableName.Membership}.actorGroupId`, groupIds);
        })
        .select(
          `${TableName.Membership}.id`,
          `${TableName.Membership}.actorUserId`,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.Membership}.actorGroupId`
        );

      if (excludeMembershipIds.length > 0) {
        void qb.whereNotIn(`${TableName.Membership}.id`, excludeMembershipIds);
      }

      const rows = await qb;
      return rows as Array<{
        id: string;
        actorUserId: string | null;
        actorIdentityId: string | null;
        actorGroupId: string | null;
      }>;
    } catch (error) {
      throw new DatabaseError({ error, name: "MembershipFindEffectiveInOrg" });
    }
  };

  return { ...orm, findGroups, getGroupById, findEffectiveInOrg };
};
