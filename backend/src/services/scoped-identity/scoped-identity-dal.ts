import { TDbClient } from "@app/db";
import { AccessScope, AccessScopeData, IdentitiesSchema, TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

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
      .where(`${TableName.Membership}.scopeOrgId`, scopeData.orgId)
      .where(`${TableName.Membership}.scope`, AccessScope.Organization)
      .where(`${TableName.Identity}.id`, identityId)
      .where((qb) => {
        if (scopeData.scope === AccessScope.Project) {
          void qb.where(`${TableName.Identity}.projectId`, scopeData.projectId);
        } else if (scopeData.scope === AccessScope.Namespace) {
          void qb.where(`${TableName.Identity}.namespaceId`, scopeData.namespaceId);
        } else {
          void qb.whereNull(`${TableName.Identity}.namespaceId`).whereNull(`${TableName.Identity}.projectId`);
        }
      })
      .select(
        selectAllTableCols(TableName.Identity),
        db.ref("id").withSchema(TableName.IdentityMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.IdentityMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.IdentityMetadata).as("metadataValue")
      );

    if (!doc) return doc;

    const formattedDoc = sqlNestRelationships({
      data: doc,
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
          void qb.where(`${TableName.Identity}.projectId`, scopeData.projectId);
        } else if (scopeData.scope === AccessScope.Namespace) {
          void qb.where(`${TableName.Identity}.namespaceId`, scopeData.namespaceId);
        } else {
          void qb.whereNull(`${TableName.Identity}.namespaceId`).whereNull(`${TableName.Identity}.projectId`);
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
