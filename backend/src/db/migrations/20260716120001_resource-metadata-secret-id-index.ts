import { Knex } from "knex";

import { TableName } from "../schemas";

// covers the (previously unindexed) secretId FK + the search's join/correlated lookups
const SECRET_ID_INDEX_NAME = "resource_metadata_secret_id_idx";

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
      (await knex.schema.hasColumn(TableName.ResourceMetadata, "secretId"))
    ) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${SECRET_ID_INDEX_NAME}"
        ON ${TableName.ResourceMetadata} ("secretId")
        WHERE "secretId" IS NOT NULL
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${SECRET_ID_INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
