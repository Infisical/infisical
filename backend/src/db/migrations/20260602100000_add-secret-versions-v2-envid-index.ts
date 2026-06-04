import { Knex } from "knex";

import { TableName } from "../schemas";

// secret_versions_v2.envId has an ON DELETE CASCADE FK to project_environments but no index, so
// deleting an environment seq-scans the entire secret_versions_v2 table to enforce the
// cascade. envId is nullable and ~99% NULL, and the cascade only ever looks up specific non-null
// env UUIDs, so a partial index over the non-null rows fully serves the cascade while staying tiny
// and imposing ~zero write overhead (NULL-envId inserts skip it).
const INDEX_NAME = "idx_secret_versions_v2_envid";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.SecretVersionV2)) &&
      (await knex.schema.hasColumn(TableName.SecretVersionV2, "envId"))
    ) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
        ON ${TableName.SecretVersionV2} ("envId")
        WHERE "envId" IS NOT NULL
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
