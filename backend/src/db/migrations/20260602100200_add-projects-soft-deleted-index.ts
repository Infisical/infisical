import { Knex } from "knex";

import { TableName } from "../schemas";

// Partial index over only soft-deleted projects. The hard-delete cron scans for
// "deleteAfter <= now()", so this keeps that scan cheap while staying tiny and
// imposing ~zero write overhead on live projects (deleteAfter IS NULL skips it).
const INDEX_NAME = "idx_projects_delete_after";
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
      (await knex.schema.hasTable(TableName.Project)) &&
      (await knex.schema.hasColumn(TableName.Project, "deleteAfter"))
    ) {
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
        ON ${TableName.Project} ("deleteAfter")
        WHERE "deleteAfter" IS NOT NULL
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
