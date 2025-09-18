import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { buildAuthMethods } from "@app/services/identity/identity-fns";

export type TIdentityNamespaceMembershipDALFactory = ReturnType<typeof identityNamespaceMembershipDALFactory>;

export const identityNamespaceMembershipDALFactory = (db: TDbClient) => {
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
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityUniversalAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityGcpAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityGcpAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAliCloudAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityAliCloudAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAwsAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityAwsAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityKubernetesAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityKubernetesAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityOciAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityOciAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityOidcAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityOidcAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityAzureAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityAzureAuth}.identityId`
      )
      .leftJoin(
        TableName.IdentityTokenAuth,
        `${TableName.IdentityProjectMembership}.identityId`,
        `${TableName.IdentityTokenAuth}.identityId`
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
        db.ref("id").as("tokenId").withSchema(TableName.IdentityTokenAuth)
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
        awsId,
        gcpId,
        kubernetesId,
        oidcId,
        azureId,
        tokenId,
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
            tokenId
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

  return {
    ...orm,
    findByNamespaceId,
    getCountByNamespaceId
  };
};
