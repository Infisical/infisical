import { Knex } from "knex";

import { TableName } from "../schemas";

// serves the org-scoped secret-metadata search (dashboard /secrets-by-metadata)
const ORG_KEY_INDEX_NAME = "resource_metadata_org_id_key_idx";

const MIGRATION_TIMEOUT = 60 * 60 * 1000;
const MIGRATION_LOCK_TIMEOUT = 30 * 1000;

export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.ResourceMetadata)) &&
      (await knex.schema.hasColumn(TableName.ResourceMetadata, "orgId")) &&
      (await knex.schema.hasColumn(TableName.ResourceMetadata, "secretId"))
    ) {
      // partial index (secret metadata only for where secretId is not null) keeps the index small and targeted at the search.
      // "value" is intentionally excluded (up to 1020 chars would risk the btree row-size limit);
      // (orgId, key) narrows enough that filtering value on the matched rows is cheap.
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${ORG_KEY_INDEX_NAME}"
        ON ${TableName.ResourceMetadata} ("orgId", "key")
        WHERE "secretId" IS NOT NULL
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${ORG_KEY_INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
