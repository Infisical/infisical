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

  const buildScopedSecretMetadataQuery = (knex: Knex, orgId: string, projectId: string) =>
    knex(TableName.ResourceMetadata)
      .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
      .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretV2}.folderId`)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
      .where(`${TableName.ResourceMetadata}.orgId`, orgId)
      .where(`${TableName.Environment}.projectId`, projectId)
      .whereNotNull(`${TableName.ResourceMetadata}.secretId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .where(`${TableName.SecretV2}.type`, SecretType.Shared);

  // Shared step-2 hydration: for the resolved candidate secretIds, fetch the metadata rows matching
  // `applyMetadataMatch` plus the secret key and tags, and nest into
  // { secretId, secretKey, folderId, metadata: [{ key, value, encryptedValue }], tags: [{ id, slug }] }.
  // encryptedValue is always selected (null for plaintext rows); the service decrypts it when present.
  const hydrateMatchedSecretMetadata = async (
    knex: Knex,
    secretIds: string[],
    applyMetadataMatch: (qb: Knex.QueryBuilder) => void
  ) => {
    const rows = await knex(TableName.ResourceMetadata)
      .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
      .leftJoin(
        TableName.SecretV2JnTag,
        `${TableName.SecretV2}.id`,
        `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`
      )
      .leftJoin(TableName.SecretTag, `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
      .whereIn(`${TableName.ResourceMetadata}.secretId`, secretIds)
      .where(applyMetadataMatch)
      .select(
        db.ref("secretId").withSchema(TableName.ResourceMetadata).as("secretId"),
        db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
        db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue"),
        db.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
        db.ref("folderId").withSchema(TableName.SecretV2).as("folderId"),
        db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
        db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
      );

    return sqlNestRelationships({
      data: rows,
      key: "secretId",
      parentMapper: (row) => ({
        secretId: row.secretId as string,
        secretKey: row.secretKey,
        folderId: row.folderId
      }),
      childrenMapper: [
        {
          key: "metadataId",
          label: "metadata" as const,
          mapper: ({ metadataKey, metadataValue, metadataEncryptedValue }) => ({
            key: metadataKey,
            value: metadataValue as string | null,
            encryptedValue: metadataEncryptedValue as Buffer | null
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
  };

  // Project-scoped search of secret metadata. A resource_metadata row holds a single key/value and a
  // secret has many rows, so the and/or combinator is evaluated per secret:
  //  - or  -> a secret matches if any condition matches one of its rows
  //  - and -> a secret matches only if every condition matches some row of that secret
  // Only plaintext `value` is matched here; encrypted values are handled by
  // searchSecretMetadataWithEncryptedValues.
  const searchSecretMetadata = async (
    { orgId, projectId, filters, operator, limit = MAX_SECRET_METADATA_SEARCH_SECRETS }: TSearchSecretMetadataDALDTO,
    tx?: Knex
  ) => {
    try {
      const knex = tx || db.replicaNode();

      // step 1: resolve the bounded set of matching secret ids (scoping enforced by the shared builder).
      const matchedSecretIdsQuery = buildScopedSecretMetadataQuery(knex, orgId, projectId);

      if (operator === SecretMetadataSearchLogicalOperator.And) {
        // and: every condition must match a row of the secret. Drive the scan from the first condition
        // (so the (orgId, key) index narrows candidates) and require the rest via correlated existence.
        filters.forEach(({ key, value }, index) => {
          if (index === 0) {
            void matchedSecretIdsQuery
              .where(`${TableName.ResourceMetadata}.key`, key)
              .where(`${TableName.ResourceMetadata}.value`, value);
            return;
          }

          void matchedSecretIdsQuery.whereExists((subQuery) => {
            return void subQuery
              .select(db.raw("1"))
              .from({ rm2: TableName.ResourceMetadata })
              .whereRaw(`??.?? = ??.??`, ["rm2", "secretId", TableName.ResourceMetadata, "secretId"])
              .where("rm2.key", key)
              .where("rm2.value", value);
          });
        });
      } else {
        // or: the joined row must match at least one condition
        void matchedSecretIdsQuery.where(buildMatchesAnyCondition(filters));
      }

      const matchedSecretRows = await matchedSecretIdsQuery
        .distinct(`${TableName.ResourceMetadata}.secretId`)
        .orderBy(`${TableName.ResourceMetadata}.secretId`)
        .limit(limit);

      const secretIds = matchedSecretRows.map((row) => row.secretId as string);
      if (!secretIds.length) return [];

      // step 2: hydrate the matched metadata rows + tags for those secrets, then nest.
      const docs = await hydrateMatchedSecretMetadata(knex, secretIds, buildMatchesAnyCondition(filters));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "SearchSecretMetadata" });
    }
  };

  // Companion to searchSecretMetadata for encrypted metadata. Encrypted values are stored as
  // non-deterministic KMS ciphertext, so they cannot be equality-matched in SQL. This query therefore
  // bounds candidates by KEY only (the requested filter keys) among rows that carry an encryptedValue,
  // then returns every requested-key row (plaintext `value` + `encryptedValue`) for those secrets so the
  // service can decrypt and match the value in-app. Plaintext rows are included so an `and` query
  // satisfied partly by plaintext and partly by encrypted rows still matches after decryption. Kept as a
  // separate query so the common plaintext path stays untouched, and it returns early (no hydration) when
  // a project has no encrypted metadata for the requested keys.
  const searchSecretMetadataWithEncryptedValues = async (
    { orgId, projectId, filters, limit = MAX_SECRET_METADATA_SEARCH_SECRETS }: TSearchSecretMetadataDALDTO,
    tx?: Knex
  ) => {
    try {
      const knex = tx || db.replicaNode();
      const keys = [...new Set(filters.map((filter) => filter.key))];

      // step 1: bounded set of secrets holding at least one encrypted metadata row for a requested key
      // — narrowed by the (orgId, key) partial index.
      const matchedSecretRows = await buildScopedSecretMetadataQuery(knex, orgId, projectId)
        .whereNotNull(`${TableName.ResourceMetadata}.encryptedValue`)
        .whereIn(`${TableName.ResourceMetadata}.key`, keys)
        .distinct(`${TableName.ResourceMetadata}.secretId`)
        .orderBy(`${TableName.ResourceMetadata}.secretId`)
        .limit(limit);

      const secretIds = matchedSecretRows.map((row) => row.secretId as string);
      if (!secretIds.length) return [];

      // step 2: hydrate every requested-key row (plaintext value + encryptedValue) + tags for those secrets.
      const docs = await hydrateMatchedSecretMetadata(knex, secretIds, (qb) => {
        void qb.whereIn(`${TableName.ResourceMetadata}.key`, keys);
      });
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "SearchSecretMetadataWithEncryptedValues" });
    }
  };

  return { ...orm, searchSecretMetadata, searchSecretMetadataWithEncryptedValues };
};
