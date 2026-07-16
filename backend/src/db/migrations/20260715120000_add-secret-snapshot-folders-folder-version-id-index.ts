import { Knex } from "knex";

import { TableName } from "../schemas";

// secret_snapshot_folders.folderVersionId is an ON DELETE CASCADE FK to secret_folder_versions with
// no index, so every folder-version delete fires an RI trigger that seq-scans this entire table.
// That times out the project hard-delete cascade and slows the nightly folder-version prune.
// The column is NOT NULL, so a full index.
const INDEX_NAME = "idx_secret_snapshot_folders_folder_version_id";
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
      (await knex.schema.hasTable(TableName.SnapshotFolder)) &&
      (await knex.schema.hasColumn(TableName.SnapshotFolder, "folderVersionId"))
    ) {
      // A prior failed CREATE INDEX CONCURRENTLY can leave an INVALID index that CREATE ... IF NOT EXISTS
      // would then skip, leaving it permanently invalid. Drop any leftover first so recreation is retry-safe.
      await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
        ON ${TableName.SnapshotFolder} ("folderVersionId")
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
