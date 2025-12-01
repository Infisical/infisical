import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, AccessScopeData, MembershipsSchema, TableName } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { TSearchResourceOperator } from "@app/lib/search-resource/search";

import { buildAuthMethods } from "../identity/identity-fns";

export type TMembershipIdentityDALFactory = ReturnType<typeof membershipIdentityDALFactory>;

type TFindIdentityArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  filter: Partial<{
    limit: number;
    offset: number;
    identityId: string;
    name: Omit<TSearchResourceOperator, "number">;
    role: Omit<TSearchResourceOperator, "number">;
  }>;
};

type TGetIdentityByIdArg = {
  scopeData: AccessScopeData;
  tx?: Knex;
  identityId: string;
};

export const membershipIdentityDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Membership);

  const getIdentityById = async ({ scopeData, tx, identityId }: TGetIdentityByIdArg) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder.on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`);
        })
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where(`${TableName.Membership}.actorIdentityId`, identityId)
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
        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin(TableName.IdentityGcpAuth, `${TableName.Identity}.id`, `${TableName.IdentityGcpAuth}.identityId`)
        .leftJoin(
          TableName.IdentityAliCloudAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin(TableName.IdentityAwsAuth, `${TableName.Identity}.id`, `${TableName.IdentityAwsAuth}.identityId`)
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(TableName.IdentityOciAuth, `${TableName.Identity}.id`, `${TableName.IdentityOciAuth}.identityId`)
        .leftJoin(TableName.IdentityOidcAuth, `${TableName.Identity}.id`, `${TableName.IdentityOidcAuth}.identityId`)
        .leftJoin(TableName.IdentityAzureAuth, `${TableName.Identity}.id`, `${TableName.IdentityAzureAuth}.identityId`)
        .leftJoin(TableName.IdentityTokenAuth, `${TableName.Identity}.id`, `${TableName.IdentityTokenAuth}.identityId`)
        .leftJoin(
          TableName.IdentityTlsCertAuth,
          `${TableName.Identity}.id`,
          `${TableName.IdentityTlsCertAuth}.identityId`
        )
        .leftJoin(TableName.IdentityLdapAuth, `${TableName.Identity}.id`, `${TableName.IdentityLdapAuth}.identityId`)
        .leftJoin(TableName.IdentityJwtAuth, `${TableName.Identity}.id`, `${TableName.IdentityJwtAuth}.identityId`)
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.ref("orgId").withSchema(TableName.Identity).as("identityOrgId"),
          db.ref("projectId").withSchema(TableName.Identity).as("identityProjectId"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity).as("identityHasDeleteProtection"),

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
          db.ref("updatedAt").withSchema(TableName.MembershipRole).as("membershipRoleUpdatedAt"),
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue"),
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
          db.ref("id").as("tlsCertId").withSchema(TableName.IdentityTlsCertAuth)
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => {
          const {
            identityId: actorIdentityId,
            identityOrgId,
            identityProjectId,
            identityHasDeleteProtection,
            identityName,
            uaId,
            awsId,
            gcpId,
            kubernetesId,
            oidcId,
            azureId,
            alicloudId,
            tokenId,
            jwtId,
            ociId,
            ldapId,
            tlsCertId
          } = el;
          return {
            ...MembershipsSchema.parse(el),
            identity: {
              name: identityName,
              id: actorIdentityId,
              hasDeleteProtection: identityHasDeleteProtection,
              orgId: identityOrgId,
              projectId: identityProjectId,
              authMethods: buildAuthMethods({
                uaId,
                awsId,
                gcpId,
                kubernetesId,
                oidcId,
                azureId,
                tokenId,
                alicloudId,
                jwtId,
                ldapId,
                ociId,
                tlsCertId
              })
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

      const el = data?.[0];
      if (!el) return el;

      return { ...el, identity: { ...el.identity, metadata: el.metadata } };
    } catch (error) {
      throw new DatabaseError({ error, name: "MembershipGetByIdentityId" });
    }
  };

  const findIdentities = async ({ scopeData, tx, filter }: TFindIdentityArg) => {
    try {
      const paginatedIdentitys = (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where((qb) => {
          if (filter.identityId) {
            void qb.where(`${TableName.Identity}.id`, filter.identityId);
          }

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

      if (filter.limit) void paginatedIdentitys.limit(filter.limit);
      if (filter.offset) void paginatedIdentitys.offset(filter.offset);

      if (filter.name || filter.role) {
        buildKnexFilterForSearchResource(
          paginatedIdentitys,
          {
            name: filter.name!,
            role: filter.role!
          },
          (attr) => {
            switch (attr) {
              case "role":
                return [`${TableName.Role}.slug`, `${TableName.MembershipRole}.role`];
              case "name":
                return `${TableName.Identity}.name`;
              default:
                throw new BadRequestError({ message: `Invalid ${String(attr)} provided` });
            }
          }
        );
      }

      const docs = await (tx || db.replicaNode())(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .distinct(`${TableName.Membership}.id`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .whereIn(`${TableName.Membership}.id`, paginatedIdentitys)
        .select(selectAllTableCols(TableName.Membership))
        .select(
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.Identity).as("identityId"),
          db.ref("orgId").withSchema(TableName.Identity).as("identityOrgId"),
          db.ref("projectId").withSchema(TableName.Identity).as("identityProjectId"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity).as("identityHasDeleteProtection"),

          db.ref("slug").withSchema(TableName.Role).as("roleSlug"),
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
            `count(${TableName.Membership}."actorIdentityId") OVER(PARTITION BY ${TableName.Membership}."scopeOrgId") as total`
          )
        );

      const data = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (el) => {
          const {
            identityId: actorIdentityId,
            identityHasDeleteProtection,
            identityName,
            identityProjectId,
            identityOrgId
          } = el;
          return {
            ...MembershipsSchema.parse(el),
            identityId: actorIdentityId,
            identity: {
              name: identityName,
              id: actorIdentityId,
              hasDeleteProtection: identityHasDeleteProtection,
              orgId: identityOrgId,
              projectId: identityProjectId
            }
          };
        },
        childrenMapper: [
          {
            key: "membershipRoleId",
            label: "roles" as const,
            mapper: ({
              roleSlug,
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
      throw new DatabaseError({ error, name: "MembershipfindIdentity" });
    }
  };

  const listAvailableIdentities = async (scopeData: AccessScopeData, rootOrgId: string) => {
    // TODO (akhil/scott): need to implement filters

    try {
      const identitiesConnectedToOrg = db
        .replicaNode()(TableName.Membership)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
        .where(`${TableName.Membership}.scope`, scopeData.scope)
        .where((qb) => {
          if (scopeData.scope === AccessScope.Project) {
            void qb.where(`${TableName.Membership}.scopeProjectId`, scopeData.projectId);
          }
        })
        .select("actorIdentityId");

      const docs = await db
        .replicaNode()(TableName.Membership)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .whereNull(`${TableName.Identity}.projectId`)
        .where((qb) => {
          // if sub org pick from root and if project pick from org of project
          if (scopeData.scope === AccessScope.Organization) {
            void qb.where(`${TableName.Membership}.scopeOrgId`, rootOrgId);
          } else {
            void qb.where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId);
          }
        })
        .whereNotIn(`${TableName.Membership}.actorIdentityId`, identitiesConnectedToOrg)
        .select(
          db.ref("id").withSchema(TableName.Identity),
          db.ref("name").withSchema(TableName.Identity),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity)
        );

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "ListAvailableIdentities" });
    }
  };

  return { ...orm, findIdentities, getIdentityById, listAvailableIdentities };
};
