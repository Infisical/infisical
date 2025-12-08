import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
  TableName,
  TIdentityAlicloudAuths,
  TIdentityAwsAuths,
  TIdentityAzureAuths,
  TIdentityGcpAuths,
  TIdentityJwtAuths,
  TIdentityKubernetesAuths,
  TIdentityOciAuths,
  TIdentityOidcAuths,
  TIdentityTlsCertAuths,
  TIdentityTokenAuths,
  TIdentityUniversalAuths,
  TMembershipRoles,
  TMemberships
} from "@app/db/schemas";
import { TIdentityLdapAuths } from "@app/db/schemas/identity-ldap-auths";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { OrderByDirection } from "@app/lib/types";
import {
  OrgIdentityOrderBy,
  TListOrgIdentitiesByOrgIdDTO,
  TSearchOrgIdentitiesByOrgIdDAL
} from "@app/services/identity/identity-types";

import { buildAuthMethods } from "./identity-fns";

export type TIdentityOrgDALFactory = ReturnType<typeof identityOrgDALFactory>;

export const identityOrgDALFactory = (db: TDbClient) => {
  const findOne = async (filter: Partial<TMemberships>, tx?: Knex) => {
    try {
      const [data] = await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where((queryBuilder) => {
          Object.entries(filter).forEach(([key, value]) => {
            void queryBuilder.where(`${TableName.Membership}.${key}`, value);
          });
        })
        .join(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)

        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAlicloudAuths>(
          TableName.IdentityAliCloudAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOciAuths>(
          TableName.IdentityOciAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin<TIdentityJwtAuths>(
          TableName.IdentityJwtAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .leftJoin<TIdentityLdapAuths>(
          TableName.IdentityLdapAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityLdapAuth}.identityId`
        )
        .leftJoin<TIdentityTlsCertAuths>(
          TableName.IdentityTlsCertAuth,
          `${TableName.Membership}.actorIdentityId`,
          `${TableName.IdentityTlsCertAuth}.identityId`
        )
        .select(
          selectAllTableCols(TableName.Membership),

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
          db.ref("name").withSchema(TableName.Identity),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity)
        );

      if (data) {
        const { name, hasDeleteProtection } = data;
        return {
          ...data,
          identity: {
            id: data.actorIdentityId as string,
            name,
            hasDeleteProtection,
            authMethods: buildAuthMethods(data)
          }
        };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOne" });
    }
  };

  const find = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentityOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      search,
      ...filter
    }: Partial<TMemberships> &
      Pick<TListOrgIdentitiesByOrgIdDTO, "offset" | "limit" | "orderBy" | "orderDirection" | "search">,
    tx?: Knex
  ) => {
    try {
      const paginatedIdentity = (tx || db.replicaNode())(TableName.Identity)
        .join(TableName.Membership, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .whereNull(`${TableName.Identity}.projectId`)
        .orderBy(`${TableName.Identity}.${orderBy}`, orderDirection)
        .select(
          selectAllTableCols(TableName.Membership),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity),
          db.ref("orgId").withSchema(TableName.Identity)
        )
        .where(filter)
        .as("paginatedIdentity");

      if (search?.length) {
        void paginatedIdentity.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      if (limit) {
        void paginatedIdentity.offset(offset).limit(limit);
      }

      // akhilmhdh: refer this for pagination with multiple left queries
      type TSubquery = Awaited<typeof paginatedIdentity>;
      const query = (tx || db.replicaNode())
        .from<TSubquery[number], TSubquery>(paginatedIdentity)
        .join<TMembershipRoles>(
          TableName.MembershipRole,
          `${TableName.MembershipRole}.membershipId`,
          "paginatedIdentity.id"
        )
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder.on(`paginatedIdentity.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`);
        })
        .leftJoin<TIdentityUniversalAuths>(
          TableName.IdentityUniversalAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin<TIdentityGcpAuths>(
          TableName.IdentityGcpAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin<TIdentityAlicloudAuths>(
          TableName.IdentityAliCloudAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin<TIdentityAwsAuths>(
          TableName.IdentityAwsAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin<TIdentityKubernetesAuths>(
          TableName.IdentityKubernetesAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin<TIdentityOciAuths>(
          TableName.IdentityOciAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin<TIdentityOidcAuths>(
          TableName.IdentityOidcAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin<TIdentityAzureAuths>(
          TableName.IdentityAzureAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin<TIdentityTokenAuths>(
          TableName.IdentityTokenAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin<TIdentityJwtAuths>(
          TableName.IdentityJwtAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .leftJoin<TIdentityLdapAuths>(
          TableName.IdentityLdapAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityLdapAuth}.identityId`
        )
        .leftJoin<TIdentityTlsCertAuths>(
          TableName.IdentityTlsCertAuth,
          "paginatedIdentity.actorIdentityId",
          `${TableName.IdentityTlsCertAuth}.identityId`
        )
        .select(
          db.ref("id").withSchema("paginatedIdentity"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          db.ref("scopeOrgId").withSchema("paginatedIdentity").as("orgId"),
          db.ref("lastLoginAuthMethod").withSchema("paginatedIdentity"),
          db.ref("orgId").withSchema("paginatedIdentity").as("identityOrgId"),
          db.ref("lastLoginTime").withSchema("paginatedIdentity"),
          db.ref("createdAt").withSchema("paginatedIdentity"),
          db.ref("updatedAt").withSchema("paginatedIdentity"),
          db.ref("actorIdentityId").withSchema("paginatedIdentity").as("identityId"),
          db.ref("identityName").withSchema("paginatedIdentity"),
          db.ref("hasDeleteProtection").withSchema("paginatedIdentity"),

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
        )
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.Role))
        .select(db.ref("name").as("crName").withSchema(TableName.Role))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.Role))
        .select(db.ref("description").as("crDescription").withSchema(TableName.Role))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.Role))
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );
      if (orderBy === OrgIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityName,
          hasDeleteProtection,
          role,
          roleId,
          id,
          orgId,
          identityOrgId,
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
          createdAt,
          updatedAt,
          lastLoginAuthMethod,
          lastLoginTime
        }) => ({
          role,
          roleId,
          identityId: identityId as string,
          id,
          orgId,
          createdAt,
          updatedAt,
          lastLoginAuthMethod,
          lastLoginTime,
          customRole: roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined,
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
              tlsCertId
            })
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

      return formattedDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  const searchIdentities = async (
    {
      limit,
      offset = 0,
      orderBy = OrgIdentityOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      searchFilter,
      orgId
    }: TSearchOrgIdentitiesByOrgIdDAL,
    tx?: Knex
  ) => {
    try {
      const searchQuery = (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .join(TableName.Identity, `${TableName.Identity}.id`, `${TableName.Membership}.actorIdentityId`)
        .whereNull(`${TableName.Identity}.projectId`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .orderBy(
          orderBy === OrgIdentityOrderBy.Role
            ? `${TableName.MembershipRole}.${orderBy}`
            : `${TableName.Identity}.${orderBy}`,
          orderDirection
        )
        .select(`${TableName.Membership}.id`)
        .select<{ id: string; total_count: string }>(
          db.raw(
            `count(${TableName.Membership}."actorIdentityId") OVER(PARTITION BY ${TableName.Membership}."scopeOrgId") as total_count`
          )
        )
        .as("searchedIdentities");

      if (searchFilter) {
        buildKnexFilterForSearchResource(searchQuery, searchFilter, (attr) => {
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

      if (limit) {
        void searchQuery.offset(offset).limit(limit);
      }

      type TSubquery = Awaited<typeof searchQuery>;
      const query = (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .join<TSubquery>(searchQuery, `${TableName.Membership}.id`, "searchedIdentities.id")
        .join(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .join(TableName.MembershipRole, `${TableName.MembershipRole}.membershipId`, `${TableName.Membership}.id`)
        .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
        .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
          void queryBuilder.on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`);
        })
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
        .select(
          db.ref("id").withSchema(TableName.Membership),
          db.ref("total_count").withSchema("searchedIdentities"),
          db.ref("role").withSchema(TableName.MembershipRole),
          db.ref("customRoleId").withSchema(TableName.MembershipRole).as("roleId"),
          db.ref("scopeOrgId").withSchema(TableName.Membership).as("orgId"),
          db.ref("createdAt").withSchema(TableName.Membership),
          db.ref("updatedAt").withSchema(TableName.Membership),
          db.ref("lastLoginAuthMethod").withSchema(TableName.Membership),
          db.ref("lastLoginTime").withSchema(TableName.Membership),
          db.ref("actorIdentityId").withSchema(TableName.Membership).as("identityId"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity),
          db.ref("orgId").withSchema(TableName.Identity).as("identityOrgId"),

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
          db.ref("id").as("ldapId").withSchema(TableName.IdentityLdapAuth)
        )
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.Role))
        .select(db.ref("name").as("crName").withSchema(TableName.Role))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.Role))
        .select(db.ref("description").as("crDescription").withSchema(TableName.Role))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.Role))
        .select(
          db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
        );

      if (orderBy === OrgIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      } else if (orderBy === OrgIdentityOrderBy.Role) {
        void query.orderByRaw(
          `
          CASE
            WHEN ??.role = ?
            THEN ??.slug
            ELSE ??.role
          END ?
          `,
          [TableName.MembershipRole, "custom", TableName.Role, TableName.MembershipRole, db.raw(orderDirection)]
        );
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityOrgId,
          identityName,
          hasDeleteProtection,
          role,
          roleId,
          total_count,
          id,
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
          createdAt,
          updatedAt,
          lastLoginTime,
          lastLoginAuthMethod
        }) => ({
          role,
          roleId,
          identityId: identityId as string,
          id,
          total_count: total_count as string,
          orgId,
          createdAt,
          updatedAt,
          lastLoginTime,
          lastLoginAuthMethod,
          customRole: roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined,
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
              ldapId
            })
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

      return { docs: formattedDocs, totalCount: Number(formattedDocs?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByOrgId" });
    }
  };

  const countAllOrgIdentities = async (
    { search, ...filter }: Partial<TMemberships> & Pick<TListOrgIdentitiesByOrgIdDTO, "search">,
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .where(filter)
        .join(TableName.Identity, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .count();

      if (search?.length) {
        void query.whereILike(`${TableName.Identity}.name`, `%${search}%`);
      }

      const identities = await query;

      return Number(identities[0].count);
    } catch (error) {
      throw new DatabaseError({ error, name: "countAllOrgIdentities" });
    }
  };

  const findByIds = async (identityIds: string[], orgId: string, tx?: Knex) => {
    try {
      const identities = await (tx || db.replicaNode())(TableName.Identity)
        .join(TableName.Membership, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Membership}.scope`, AccessScope.Organization)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .whereNotNull(`${TableName.Membership}.actorIdentityId`)
        .whereNull(`${TableName.Identity}.projectId`)
        .whereIn(`${TableName.Identity}.id`, identityIds)
        .distinctOn(`${TableName.Identity}.id`)
        .orderBy(`${TableName.Identity}.id`)
        .select(selectAllTableCols(TableName.Identity));

      return identities;
    } catch (error) {
      throw new DatabaseError({ error, name: "findByIds" });
    }
  };

  return { find, findOne, countAllOrgIdentities, searchIdentities, findByIds };
};
