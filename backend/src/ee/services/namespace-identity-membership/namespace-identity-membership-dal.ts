import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildKnexFilterForSearchResource } from "@app/lib/search-resource/db";
import { OrderByDirection } from "@app/lib/types";
import { buildAuthMethods } from "@app/services/identity/identity-fns";
import { NamespaceIdentityOrderBy, TSearchNamespaceIdentitiesDAL } from "./namespace-identity-membership-types";

export type TNamespaceIdentityMembershipDALFactory = ReturnType<typeof namespaceIdentityMembershipDALFactory>;

export const namespaceIdentityMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NamespaceMembership);

  const findByNamespaceId = async (
    namespaceId: string,
    {
      limit = 50,
      offset = 0,
      orderBy = "createdAt",
      orderDirection = "desc",
      search,
      identityId
    }: {
      limit?: number;
      offset?: number;
      orderBy?: string;
      orderDirection?: "asc" | "desc";
      search?: string;
      identityId?: string;
    } = {}
  ) => {
    const query = db(TableName.NamespaceMembership)
      .where(`${TableName.NamespaceMembership}.namespaceId`, namespaceId)
      .whereNotNull(`${TableName.NamespaceMembership}.orgIdentityMembershipId`)
      .join(
        TableName.IdentityOrgMembership,
        `${TableName.NamespaceMembership}.orgIdentityMembershipId`,
        `${TableName.IdentityOrgMembership}.id`
      )
      .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
      .leftJoin(
        TableName.NamespaceMembershipRole,
        `${TableName.NamespaceMembership}.id`,
        `${TableName.NamespaceMembershipRole}.namespaceMembershipId`
      )
      .leftJoin(
        TableName.NamespaceRole,
        `${TableName.NamespaceMembershipRole}.customRoleId`,
        `${TableName.NamespaceRole}.id`
      )
      .leftJoin(
        TableName.IdentityUniversalAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityUniversalAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityGcpAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityGcpAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAliCloudAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityAliCloudAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAwsAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityAwsAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityKubernetesAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityKubernetesAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityOciAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityOciAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityOidcAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityOidcAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAzureAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityAzureAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityTokenAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityTokenAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityJwtAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityJwtAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityLdapAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityLdapAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityTlsCertAuth,
        `${TableName.IdentityOrgMembership}.identityId`,
        `${TableName.IdentityTlsCertAuth}.identityId`
      )
      .select(selectAllTableCols(TableName.NamespaceMembership))
      .select(
        db.ref("name").withSchema(TableName.Identity).as("identityName"),
        db.ref("authMethod").withSchema(TableName.Identity).as("identityAuthMethod"),
        db.ref("id").withSchema(TableName.Identity).as("identityOriginalId"),
        db.ref("hasDeleteProtection").withSchema(TableName.Identity),
        db.ref("name").withSchema(TableName.NamespaceRole).as("customRoleName"),
        db.ref("slug").withSchema(TableName.NamespaceRole).as("customRoleSlug"),
        db.ref("id").withSchema(TableName.NamespaceMembershipRole).as("membershipRoleId"),
        db.ref("role").withSchema(TableName.NamespaceMembershipRole).as("role"),
        db.ref("customRoleId").withSchema(TableName.NamespaceMembershipRole).as("customRoleId"),
        db.ref("isTemporary").withSchema(TableName.NamespaceMembershipRole).as("isTemporary"),
        db.ref("temporaryMode").withSchema(TableName.NamespaceMembershipRole).as("temporaryMode"),
        db.ref("temporaryRange").withSchema(TableName.NamespaceMembershipRole).as("temporaryRange"),
        db.ref("temporaryAccessStartTime").withSchema(TableName.NamespaceMembershipRole).as("temporaryAccessStartTime"),
        db.ref("temporaryAccessEndTime").withSchema(TableName.NamespaceMembershipRole).as("temporaryAccessEndTime"),
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

    if (identityId) {
      void query.where(`${TableName.IdentityOrgMembership}.identityId`, identityId);
    }

    if (search) {
      void query.where(`${TableName.Identity}.name`, "ilike", `%${search}%`);
    }

    const memberships = await query
      .orderBy(`${TableName.NamespaceMembership}.${orderBy}`, orderDirection)
      .limit(limit)
      .offset(offset);

    const members = sqlNestRelationships({
      data: memberships,
      parentMapper: ({
        identityName,
        identityOriginalId,
        hasDeleteProtection,
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
        id,
        createdAt,
        updatedAt
      }) => ({
        id,
        identityId: identityOriginalId,
        createdAt,
        updatedAt,
        namespaceId,
        identity: {
          id: identityOriginalId,
          name: identityName,
          hasDeleteProtection,
          authMethods: buildAuthMethods({
            uaId,
            awsId,
            gcpId,
            kubernetesId,
            oidcId,
            azureId,
            tokenId,
            alicloudId,
            ociId,
            jwtId,
            ldapId,
            tlsCertId
          })
        }
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
    return members;
  };

  const getCountByNamespaceId = async (namespaceId: string, { search }: { search?: string } = {}) => {
    const query = db(TableName.NamespaceMembership)
      .where(`${TableName.NamespaceMembership}.namespaceId`, namespaceId)
      .join(
        TableName.IdentityOrgMembership,
        `${TableName.NamespaceMembership}.orgIdentityMembershipId`,
        `${TableName.IdentityOrgMembership}.id`
      )
      .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`);

    if (search) {
      void query.where(`${TableName.Identity}.name`, "ilike", `%${search}%`);
    }

    const identities = await query.count();
    return Number(identities[0].count);
  };

  const searchIdentities = async ({
    limit,
    offset = 0,
    orderBy = NamespaceIdentityOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    searchFilter,
    namespaceId
  }: Omit<TSearchNamespaceIdentitiesDAL, "orgId"> & { namespaceId: string }) => {
    try {
      const searchQuery = db(TableName.NamespaceMembership)
        .where(`${TableName.NamespaceMembership}.namespaceId`, namespaceId)
        .whereNotNull(`${TableName.NamespaceMembership}.orgIdentityMembershipId`)
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.NamespaceMembership}.orgIdentityMembershipId`,
          `${TableName.IdentityOrgMembership}.id`
        )
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(
          TableName.NamespaceMembershipRole,
          `${TableName.NamespaceMembership}.id`,
          `${TableName.NamespaceMembershipRole}.namespaceMembershipId`
        )
        .leftJoin(
          TableName.NamespaceRole,
          `${TableName.NamespaceMembershipRole}.customRoleId`,
          `${TableName.NamespaceRole}.id`
        )
        .orderBy(
          orderBy === NamespaceIdentityOrderBy.Role
            ? `${TableName.NamespaceMembershipRole}.${orderBy}`
            : `${TableName.Identity}.${orderBy}`,
          orderDirection
        )
        .select(`${TableName.NamespaceMembership}.id`)
        .select(
          db.raw(
            `count(${TableName.NamespaceMembership}."id") OVER(PARTITION BY ${TableName.NamespaceMembership}."namespaceId") as total_count`
          )
        )
        .as("searchedIdentities");

      if (searchFilter) {
        buildKnexFilterForSearchResource(searchQuery, searchFilter, (attr) => {
          switch (attr) {
            case "role":
              return [`${TableName.NamespaceRole}.slug`, `${TableName.NamespaceMembershipRole}.role`];
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
      const query = db(TableName.NamespaceMembership)
        .where(`${TableName.NamespaceMembership}.namespaceId`, namespaceId)
        .join<TSubquery>(searchQuery, `${TableName.NamespaceMembership}.id`, "searchedIdentities.id")
        .join(
          TableName.IdentityOrgMembership,
          `${TableName.NamespaceMembership}.orgIdentityMembershipId`,
          `${TableName.IdentityOrgMembership}.id`
        )
        .join(TableName.Identity, `${TableName.IdentityOrgMembership}.identityId`, `${TableName.Identity}.id`)
        .leftJoin(
          TableName.NamespaceMembershipRole,
          `${TableName.NamespaceMembership}.id`,
          `${TableName.NamespaceMembershipRole}.namespaceMembershipId`
        )
        .leftJoin(
          TableName.NamespaceRole,
          `${TableName.NamespaceMembershipRole}.customRoleId`,
          `${TableName.NamespaceRole}.id`
        )
        .leftJoin(
          TableName.IdentityUniversalAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityUniversalAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityGcpAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityGcpAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAliCloudAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAliCloudAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAwsAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAwsAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityKubernetesAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityKubernetesAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOciAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityOciAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityOidcAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityOidcAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityAzureAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityAzureAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTokenAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityTokenAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityJwtAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityJwtAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityLdapAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityLdapAuth}.identityId`
        )
        .leftJoin(
          TableName.IdentityTlsCertAuth,
          `${TableName.IdentityOrgMembership}.identityId`,
          `${TableName.IdentityTlsCertAuth}.identityId`
        )
        .select(
          selectAllTableCols(TableName.NamespaceMembership),
          db.ref("total_count").withSchema("searchedIdentities"),
          db.ref("name").withSchema(TableName.Identity).as("identityName"),
          db.ref("id").withSchema(TableName.Identity).as("identityOriginalId"),
          db.ref("hasDeleteProtection").withSchema(TableName.Identity),
          db.ref("name").withSchema(TableName.NamespaceRole).as("customRoleName"),
          db.ref("slug").withSchema(TableName.NamespaceRole).as("customRoleSlug"),
          db.ref("id").withSchema(TableName.NamespaceMembershipRole).as("membershipRoleId"),
          db.ref("role").withSchema(TableName.NamespaceMembershipRole).as("role"),
          db.ref("customRoleId").withSchema(TableName.NamespaceMembershipRole).as("customRoleId"),
          db.ref("isTemporary").withSchema(TableName.NamespaceMembershipRole).as("isTemporary"),
          db.ref("temporaryMode").withSchema(TableName.NamespaceMembershipRole).as("temporaryMode"),
          db.ref("temporaryRange").withSchema(TableName.NamespaceMembershipRole).as("temporaryRange"),
          db
            .ref("temporaryAccessStartTime")
            .withSchema(TableName.NamespaceMembershipRole)
            .as("temporaryAccessStartTime"),
          db.ref("temporaryAccessEndTime").withSchema(TableName.NamespaceMembershipRole).as("temporaryAccessEndTime"),
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

      if (orderBy === NamespaceIdentityOrderBy.Name) {
        void query.orderBy("identityName", orderDirection);
      } else if (orderBy === NamespaceIdentityOrderBy.Role) {
        void query.orderByRaw(
          `
          CASE
            WHEN ??.role = ?
            THEN ??.slug
            ELSE ??.role
          END ?
          `,
          [
            TableName.NamespaceMembershipRole,
            "custom",
            TableName.NamespaceRole,
            TableName.NamespaceMembershipRole,
            db.raw(orderDirection)
          ]
        );
      }

      const docs = await query;
      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: ({
          identityName,
          identityOriginalId,
          hasDeleteProtection,
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
          tlsCertId,
          createdAt,
          updatedAt
        }) => ({
          id,
          identityId: identityOriginalId,
          total_count: total_count as string,
          namespaceId,
          createdAt,
          updatedAt,
          identity: {
            id: identityOriginalId,
            name: identityName,
            hasDeleteProtection,
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

      return { docs: formattedDocs, totalCount: Number(formattedDocs?.[0]?.total_count ?? 0) };
    } catch (error) {
      throw new DatabaseError({ error, name: "SearchIdentities" });
    }
  };

  return {
    ...orm,
    findByNamespaceId,
    getCountByNamespaceId,
    searchIdentities
  };
};
