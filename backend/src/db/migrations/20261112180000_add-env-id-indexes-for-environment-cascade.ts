import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

// Deleting an environment (and so a project or an org) cascades into these tables by "envId". Without
// an index each cascade is a sequential scan of a very large table, which pushes org deletion past the
// statement timeout.
const INDEXES = [
  { table: TableName.Snapshot, name: "idx_secret_snapshots_env_id" },
  { table: TableName.SnapshotFolder, name: "idx_secret_snapshot_folders_env_id" },
  { table: TableName.SecretFolderVersion, name: "idx_secret_folder_versions_env_id" }
];

export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    for (const { table, name } of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      if ((await knex.schema.hasTable(table)) && (await knex.schema.hasColumn(table, "envId"))) {
        // eslint-disable-next-line no-await-in-loop
        await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} ("envId")`);
      }
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { name } of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP INDEX IF EXISTS ${name}`);
  }
}

const config = { transaction: false };
export { config };
