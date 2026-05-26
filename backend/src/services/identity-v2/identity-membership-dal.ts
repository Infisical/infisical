import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { OrderByDirection } from "@app/lib/types";

import { buildAuthMethods } from "../identity/identity-fns";
import {
  accessScopeToSearchIdentitiesScope,
  OrgIdentitySearchOrderBy,
  SearchIdentitiesScope,
  TCountIdentitiesV2DAL,
  TSearchIdentitiesV2DAL
} from "./identity-types";

export type TIdentityMembershipV2DALFactory = ReturnType<typeof identityMembershipV2DALFactory>;

export const identityMembershipV2DALFactory = (db: TDbClient) => {
  const searchIdentitiesV2 = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentitySearchOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      searchFilter,
      orgId,
      scope,
      accessibleProjectIds
    }: TSearchIdentitiesV2DAL,
    tx?: Knex
  ) => {
    try {
      const includeOrgScope = scope.includes(SearchIdentitiesScope.OrganizationScope);
      const includeProjectScope = scope.includes(SearchIdentitiesScope.ProjectScope);

      const applyScopeFilter = (qb: Knex.QueryBuilder) => {
        void qb.whereNotNull(`${TableName.Membership}.actorIdentityId`);

        // Project-owned identities (Identity.projectId IS NOT NULL) always carry a NoAccess
        // org-level Membership row as an implementation detail of their creation flow
        // (see identity-v2/identity-service.ts createIdentity). Excluding them here keeps
        // the org-scope listing limited to true org-level identities, matching V1 behavior
        // and preventing duplicate rows in the combined org+project view.
        const orgScopeBranch = (sub: Knex.QueryBuilder) => {
          void sub
            .where(`${TableName.Membership}.scope`, AccessScope.Organization)
            .where(`${TableName.Membership}.scopeOrgId`, orgId)
            .whereNull(`${TableName.Identity}.projectId`);
        };

        const projectScopeBranch = (sub: Knex.QueryBuilder) => {
          void sub
            .where(`${TableName.Membership}.scope`, AccessScope.Project)
            .where(`${TableName.Membership}.scopeOrgId`, orgId)
            .whereIn(`${TableName.Membership}.scopeProjectId`, accessibleProjectIds);
        };

        if (includeOrgScope && includeProjectScope) {
          void qb.where((nested) => {
            void nested.where((sub) => orgScopeBranch(sub)).orWhere((sub) => projectScopeBranch(sub));
          });
        } else if (includeOrgScope) {
          orgScopeBranch(qb);
        } else if (includeProjectScope) {
          projectScopeBranch(qb);
        }
      };

      // Identity-auth login services update the lastLogin* columns on exactly one Membership row
      // keyed on the identity's home org (scope=Organization, scopeOrgId=Identity.orgId, projectId
      // omitted). The project Membership row created at `createMembershipIdentity` time therefore
      // never receives a login timestamp. To avoid surfacing "Never" in the project / all tabs for
      // an identity that authenticates regularly, fall back to the matching org Membership via a
      // correlated subquery. The bound scopeOrgId must reference Identity.orgId (not the caller's
      // orgId) so the fallback also works for a root-org identity linked into a sub-org.
      const lastLoginFallbackRaw = (column: "lastLoginTime" | "lastLoginAuthMethod", outputAlias: string) =>
        db.raw(
          `COALESCE(??.??, (SELECT om.?? FROM ?? AS om WHERE om.?? = ??.?? AND om.?? = ? AND om.?? = ??.??)) as ??`,
          [
            TableName.Membership,
            column,
            column,
            TableName.Membership,
            "actorIdentityId",
            TableName.Membership,
            "actorIdentityId",
            "scope",
            AccessScope.Organization,
            "scopeOrgId",
            TableName.Identity,
            "orgId",
            outputAlias
          ]
        );

      const searchedMemberships = (tx || db.replicaNode())(TableName.Membership)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .where(applyScopeFilter)
        .groupBy(
          `${TableName.Membership}.id`,
          `${TableName.Identity}.name`,
          `${TableName.Identity}.orgId`,
          `${TableName.Membership}.lastLoginTime`
        )
        .select(`${TableName.Membership}.id`)
        .select(db.ref("name").withSchema(TableName.Identity).as("identityName"))
        .select(lastLoginFallbackRaw("lastLoginTime", "lastLoginSort"))
        .select<{ id: string; identityName: string; roleSort: string; total_count: string }>(
          db.raw(`MIN(COALESCE(??, ??)) as "roleSort"`, [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`])
        )
        .select<{ id: string; identityName: string; roleSort: string; total_count: string }>(
          db.raw(`COUNT(*) OVER() as total_count`)
        );

      if (searchFilter) {
        buildKnexFilterForSearchResource(searchedMemberships, searchFilter, (attr) => {
          switch (attr) {
            case "role":
              return [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`];
            case "name":
              return `${TableName.Identity}.name`;
            default:
              throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
          }
        });
      }

      if (orderBy === OrgIdentitySearchOrderBy.Role) {
        void searchedMemberships.orderBy("roleSort", orderDirection, "last");
      } else if (orderBy === OrgIdentitySearchOrderBy.LastLogin) {
        // Never-used identities (lastLoginTime IS NULL) are always pushed to the bottom
        // regardless of sort direction so the visible page is dominated by real activity.
        void searchedMemberships.orderBy("lastLoginSort", orderDirection, "last");
      } else {
        void searchedMemberships.orderBy("identityName", orderDirection);
      }
      // Secondary sort by membership id keeps pagination deterministic when the primary
      // sort key ties (duplicate names, identical aggregated role).
      void searchedMemberships.orderBy(`${TableName.Membership}.id`, "asc");

      if (limit) {
        void searchedMemberships.offset(offset).limit(limit);
      }

      const searchedMembershipsSubquery = searchedMemberships.as("searchedMemberships");
      type TSubquery = Awaited<typeof searchedMemberships>;

      const query = (tx || db.replicaNode())(TableName.Membership)
        .join<TSubquery>(searchedMembershipsSubquery, `${TableName.Membership}.id`, "searchedMemberships.id")
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.Project, `${TableName.Project}.id`, `${TableName.Membership}.scopeProjectId`)
        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityGcpAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAliCloudAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAwsAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOciAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOidcAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAzureAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTokenAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityJwtAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityLdapAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityLdapAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTlsCertAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityTlsCertAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentitySpiffeAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentitySpiffeAuth}.identityId`
        )
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("scope").withSchema(TableName.Membership).as("membershipScope"),
          db.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("scopeProjectId").withSchema(TableName.Membership).as("scopeProjectId"),
          db.ref("total_count").withSchema("searchedMemberships"),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("updatedAt").withSchema(TableName.Membership),
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("identityId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity),
          db.ref("orgId").withSchema(TableName.Identity).as("identityOrgId"),

          db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          db.ref("isTemporary").withSchema(TableName.MembershipRole),
          db.ref("temporaryMode").withSchema(TableName.MembershipRole),
          db.ref("temporaryRange").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.MembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),

          db.ref("id").as("projectIdRef").withSchema(TableName.Project),
          db.ref("name").as("projectName").withSchema(TableName.Project),
          db.ref("slug").as("projectSlug").withSchema(TableName.Project),
          db.ref("type").as("projectType").withSchema(TableName.Project),

          db.ref("id").as("uaId").withSchema(TableName.IdentityUniversalAuth),
          db.ref("id").as("gcpId").withSchema(TableName.IdentityGcpAuth),
          db.ref("id").as("alicloudId").withSchema(TableName.IdentityAliCloudAuth),
          db.ref("id").as("awsId").withSchema(TableName.IdentityAwsAuth),
          db.ref("id").as("kubernetesId").withSchema(TableName.IdentityKubernetesAuth),
          db.ref("id").as("ociId").withSchema(TableName.IdentityOciAuth),
          db.ref("id").as("oidcId").withSchema(TableName.IdentityOidcAuth),
          db.ref("id").as("azureId").withSchema(TableName.IdentityAzureAuth),
          db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth),
          db.ref("id").as("jwtId").withSchema(TableName.IdentityJwtAuth),
          db.ref("id").as("ldapId").withSchema(TableName.IdentityLdapAuth),
          db.ref("id").as("tlsCertId").withSchema(TableName.IdentityTlsCertAuth),
          db.ref("id").as("spiffeId").withSchema(TableName.IdentitySpiffeAuth)
        )
        .select(db.ref("name").as("crName").withSchema(TableName.Role))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.Role))
        .select(db.ref("description").as("crDescription").withSchema(TableName.Role))
        .select(
          lastLoginFallbackRaw("lastLoginTime", "lastLoginTime"),
          lastLoginFallbackRaw("lastLoginAuthMethod", "lastLoginAuthMethod")
        );

      if (orderBy === OrgIdentitySearchOrderBy.Role) {
        void query.orderBy("searchedMemberships.roleSort", orderDirection, "last");
      } else if (orderBy === OrgIdentitySearchOrderBy.LastLogin) {
        void query.orderBy("searchedMemberships.lastLoginSort", orderDirection, "last");
      } else {
        void query.orderBy("searchedMemberships.identityName", orderDirection);
      }
      void query.orderBy("searchedMemberships.id", "asc");

      // lastLoginTime / lastLoginAuthMethod are produced by raw COALESCE expressions
      // (see lastLoginFallbackRaw), so Knex's inferred record type doesn't include them.
      // They are present at runtime — add them to the type explicitly so the nest-mapper
      // destructuring below compiles.
      const docs = (await query) as (typeof query extends PromiseLike<infer R>
        ? R extends (infer Row)[]
          ? Row & { lastLoginTime: Date | null; lastLoginAuthMethod: string | null }
          : never
        : never)[];

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          identityId,
          identityOrgId,
          identityName,
          hasDeleteProtection,
          total_count,
          id,
          membershipScope,
          orgId: membershipOrgId,
          scopeProjectId,
          projectIdRef,
          projectName,
          projectSlug,
          projectType,
          uaId,
          alicloudId,
          awsId,
          gcpId,
          jwtId,
          kubernetesId,
          ociId,
          oidcId,
          azureId,
          tokenId,
          ldapId,
          tlsCertId,
          spiffeId,
          createdAt,
          updatedAt,
          lastLoginTime,
          lastLoginAuthMethod
        }) => ({
          id,
          identityId: identityId as string,
          scope: accessScopeToSearchIdentitiesScope(membershipScope),
          orgId: membershipOrgId,
          projectId: scopeProjectId,
          total_count: total_count as string,
          createdAt,
          updatedAt,
          lastLoginTime,
          lastLoginAuthMethod,
          project: projectIdRef
            ? {
                id: projectIdRef,
                name: projectName,
                slug: projectSlug,
                type: projectType
              }
            : null,
          identity: {
            id: identityId as string,
            name: identityName,
            hasDeleteProtection,
            orgId: identityOrgId,
            authMethods: buildAuthMethods({
              uaId,
              alicloudId,
              awsId,
              gcpId,
              kubernetesId,
              ociId,
              oidcId,
              azureId,
              tokenId,
              jwtId,
              ldapId,
              tlsCertId,
              spiffeId
            })
          }
        }),
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              membershipRoleId,
              role,
              roleId,
              crName,
              crSlug,
              crDescription,
              isTemporary,
              temporaryMode,
              temporaryRange,
              temporaryAccessStartTime,
              temporaryAccessEndTime
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId: roleId,
              customRoleName: crName ?? null,
              customRoleSlug: crSlug ?? null,
              customRoleDescription: crDescription ?? null,
              isTemporary,
              temporaryMode,
              temporaryRange,
              temporaryAccessStartTime,
              temporaryAccessEndTime
            })
          }
        ]
      });

      return { docs: formattedDocs, totalCount: Number(formattedDocs?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "SearchIdentitiesV2" });
    }
  };

  const countIdentitiesV2 = async (
    { orgId, scope, accessibleProjectIds, searchFilter }: TCountIdentitiesV2DAL,
    tx?: Knex
  ) => {
    try {
      const includeOrgScope = scope.includes(SearchIdentitiesScope.OrganizationScope);
      const includeProjectScope = scope.includes(SearchIdentitiesScope.ProjectScope);

      const query = (tx || db.replicaNode())(TableName.Membership)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`);

      const orgScopeBranch = (sub: Knex.QueryBuilder) => {
        void sub
          .where(`${TableName.Membership}.scope`, AccessScope.Organization)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .whereNull(`${TableName.Identity}.projectId`);
      };

      const projectScopeBranch = (sub: Knex.QueryBuilder) => {
        void sub
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeOrgId`, orgId)
          .whereIn(`${TableName.Membership}.scopeProjectId`, accessibleProjectIds);
      };

      if (includeOrgScope && includeProjectScope) {
        void query.where((nested) => {
          void nested.where((sub) => orgScopeBranch(sub)).orWhere((sub) => projectScopeBranch(sub));
        });
      } else if (includeOrgScope) {
        void query.where((sub) => orgScopeBranch(sub));
      } else if (includeProjectScope) {
        void query.where((sub) => projectScopeBranch(sub));
      } else {
        return { organization: includeOrgScope ? 0 : undefined, project: includeProjectScope ? 0 : undefined };
      }

      if (searchFilter) {
        buildKnexFilterForSearchResource(query, searchFilter, (attr) => {
          switch (attr) {
            case "role":
              return [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`];
            case "name":
              return `${TableName.Identity}.name`;
            default:
              throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
          }
        });
      }

      const rows = await query
        .groupBy(`${TableName.Membership}.scope`)
        .select(db.ref("scope").withSchema(TableName.Membership).as("scope"))
        .select<{ scope: string; count: string }[]>(
          db.raw(`COUNT(DISTINCT ??) as count`, [`${TableName.Membership}.id`])
        );

      const counts: { organization?: number; project?: number } = {};
      if (includeOrgScope) counts.organization = 0;
      if (includeProjectScope) counts.project = 0;
      for (const row of rows) {
        if (row.scope === AccessScope.Organization && includeOrgScope) {
          counts.organization = Number(row.count);
        } else if (row.scope === AccessScope.Project && includeProjectScope) {
          counts.project = Number(row.count);
        }
      }

      return counts;
    } catch (error) {
      throw new DatabaseError({ error, name: "CountIdentitiesV2" });
    }
  };

  return { searchIdentitiesV2, countIdentitiesV2 };
};
