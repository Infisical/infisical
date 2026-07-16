import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretType, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, sqlNestRelationships } from "@app/lib/knex";

import { SecretMetadataSearchLogicalOperator, TSearchSecretMetadataDALDTO } from "./resource-metadata-types";

export type TResourceMetadataDALFactory = ReturnType<typeof resourceMetadataDALFactory>;

// defensive cap on the number of matched secrets scanned before permission filtering.
// full pagination is intentionally out of scope for now.
const MAX_SECRET_METADATA_SEARCH_SECRETS = 100;

export const resourceMetadataDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ResourceMetadata);

  // builds the "row matches at least one condition" predicate: OR of (key = ? AND value = ?)
  const buildMatchesAnyCondition = (filters: TSearchSecretMetadataDALDTO["filters"]) => (qb: Knex.QueryBuilder) => {
    return filters.forEach(({ key, value }) => {
      return void qb.orWhere((subFilter) => {
        return void subFilter
          .where(`${TableName.ResourceMetadata}.key`, key)
          .where(`${TableName.ResourceMetadata}.value`, value);
      });
    });
  };

  // Project-scoped search of secret metadata. A resource_metadata row holds a single key/value and a
  // secret has many rows, so the and/or combinator is evaluated per secret:
  //  - or  -> a secret matches if any condition matches one of its rows
  //  - and -> a secret matches only if every condition matches some row of that secret
  // Only plaintext `value` is matched (encrypted metadata values cannot be matched by equality).
  const searchSecretMetadata = async (
    { orgId, projectId, filters, operator, limit = MAX_SECRET_METADATA_SEARCH_SECRETS }: TSearchSecretMetadataDALDTO,
    tx?: Knex
  ) => {
    try {
      const knex = tx || db.replicaNode();

      // step 1: resolve the bounded set of matching secret ids (org-scoped, non-soft-deleted, shared).
      const matchedSecretIdsQuery = knex(TableName.ResourceMetadata)
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
        .where(`${TableName.ResourceMetadata}.orgId`, orgId)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNotNull(`${TableName.ResourceMetadata}.secretId`)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .where(`${TableName.SecretV2}.type`, SecretType.Shared)
        .where(buildMatchesAnyCondition(filters));

      // and: the secret must additionally satisfy every condition (correlated existence per condition)
      if (operator === SecretMetadataSearchLogicalOperator.And) {
        filters.forEach(({ key, value }) => {
          return void matchedSecretIdsQuery.whereExists((subQuery) => {
            return void subQuery
              .select(db.raw("1"))
              .from({ rm2: TableName.ResourceMetadata })
              .whereRaw(`??.?? = ??.??`, ["rm2", "secretId", TableName.ResourceMetadata, "secretId"])
              .where("rm2.key", key)
              .where("rm2.value", value);
          });
        });
      }

      const matchedSecretRows = await matchedSecretIdsQuery
        .distinct(`${TableName.ResourceMetadata}.secretId`)
        .orderBy(`${TableName.ResourceMetadata}.secretId`)
        .limit(limit);

      const secretIds = matchedSecretRows.map((row) => row.secretId as string);
      if (!secretIds.length) return [];

      // step 2: hydrate the matched metadata rows + tags + permission context for those secrets, then nest.
      const rows = await knex(TableName.ResourceMetadata)
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .leftJoin(
          TableName.SecretV2JnTag,
          `${TableName.SecretV2}.id`,
          `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
        )
        .leftJoin(
          TableName.SecretTag,
          `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`,
          `${TableName.SecretTag}.id`
        )
        .whereIn(`${TableName.ResourceMetadata}.secretId`, secretIds)
        .where(buildMatchesAnyCondition(filters))
        .select(
          db.ref("secretId").withSchema(TableName.ResourceMetadata).as("secretId"),
          db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
          db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
          db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
          db.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("folderId"),
          db.ref("projectId").withSchema(TableName.Environment).as("projectId"),
          db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
          db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
        );

      const docs = sqlNestRelationships({
        data: rows,
        key: "secretId",
        parentMapper: (row) => ({
          secretId: row.secretId as string,
          secretKey: row.secretKey,
          folderId: row.folderId,
          projectId: row.projectId
        }),
        childrenMapper: [
          {
            key: "metadataId",
            label: "metadata" as const,
            mapper: ({ metadataId, metadataKey, metadataValue }) => ({
              id: metadataId,
              key: metadataKey,
              value: metadataValue as string | null
            })
          },
          {
            key: "tagId",
            label: "tags" as const,
            mapper: ({ tagId, tagSlug }) => ({
              id: tagId,
              slug: tagSlug
            })
          }
        ]
      });

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "SearchSecretMetadata" });
    }
  };

  return { ...orm, searchSecretMetadata };
};
