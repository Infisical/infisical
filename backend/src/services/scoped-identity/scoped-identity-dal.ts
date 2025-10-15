import { TDbClient } from "@app/db";
import { AccessScope, AccessScopeData, IdentitiesSchema, TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

import { buildAuthMethods } from "../identity/identity-fns";

export type TScopedIdentityDALFactory = ReturnType<typeof scopedIdentityDALFactory>;

export const scopedIdentityDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Identity);

  const getIdentityById = async (scopeData: AccessScopeData, identityId: string) => {
    const doc = await db
      .replicaNode()(TableName.Identity)
      .join(TableName.Membership, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
      .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
        void queryBuilder
          .on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`)
          .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
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
      .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .where(`${TableName.Identity}.id`, identityId)
      .where((qb) => {
        if (scopeData.scope === AccessScope.Project) {
          void qb.where(`${TableName.Identity}.scopeProjectId`, scopeData.projectId);
        } else if (scopeData.scope === AccessScope.Namespace) {
          void qb.where(`${TableName.Identity}.scopeNamespaceId`, scopeData.namespaceId);
        } else {
          void qb.whereNull(`${TableName.Identity}.scopeNamespaceId`).whereNull(`${TableName.Identity}.scopeProjectId`);
        }
      })
      .select(
        selectAllTableCols(TableName.Identity),
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

    if (!doc) return doc;

    const formattedDoc = sqlNestRelationships({
      data: doc,
      key: "id",
      parentMapper: (el) => {
        const {
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
          ...IdentitiesSchema.parse(el),
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
        };
      },
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

    return formattedDoc?.[0];
  };

  const listIdentities = async (
    scopeData: AccessScopeData,
    filter: { limit?: number; offset?: number; search?: string } = {}
  ) => {
    const query = db
      .replicaNode()(TableName.Identity)
      .join(TableName.Membership, `${TableName.Membership}.actorIdentityId`, `${TableName.Identity}.id`)
      .leftJoin(TableName.IdentityMetadata, (queryBuilder) => {
        void queryBuilder
          .on(`${TableName.Membership}.actorIdentityId`, `${TableName.IdentityMetadata}.identityId`)
          .andOn(`${TableName.Membership}.scopeOrgId`, `${TableName.IdentityMetadata}.orgId`);
      })
      .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .where((qb) => {
        if (scopeData.scope === AccessScope.Project) {
          void qb.where(`${TableName.Identity}.scopeProjectId`, scopeData.projectId);
        } else if (scopeData.scope === AccessScope.Namespace) {
          void qb.where(`${TableName.Identity}.scopeNamespaceId`, scopeData.namespaceId);
        } else {
          void qb.whereNull(`${TableName.Identity}.scopeNamespaceId`).whereNull(`${TableName.Identity}.scopeProjectId`);
        }
      })
      .select(
        selectAllTableCols(TableName.Identity),
        db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
      )
      .select(db.raw(`count(distinct ??) over () as ??`, [`${TableName.Identity}.id`, "count"]));

    if (filter.limit) void query.limit(filter.limit);
    if (filter.offset) void query.offset(filter.offset || 0);

    if (filter.search) void query.whereILike(`${TableName.Identity}.name`, `%${filter.search}%`);

    const docs = await query;

    const formattedDoc = sqlNestRelationships({
      data: docs,
      key: "id",
      parentMapper: (el) => IdentitiesSchema.parse(el),
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

    return { docs: formattedDoc, count: Number((docs?.[0] as unknown as { count: number })?.count) };
  };

  return { ...orm, listIdentities, getIdentityById };
};
