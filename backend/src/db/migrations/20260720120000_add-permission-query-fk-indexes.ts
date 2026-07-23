import { Knex } from "knex";

import { TableName } from "../schemas";

// getPermissionFingerprint (and its siblings getPermission / getProjectUserPermissions /
// getProjectIdentityPermissions) LEFT JOIN identity_metadata and additional_privileges on their
// FK columns. Postgres does not auto-index FK columns, and neither table has ever had an index on
// any of them, so each join degrades to a seq scan.
//
// Nullable FK columns get a partial index (WHERE col IS NOT NULL): the actor/scope xor check
// constraints guarantee only one actor column and one scope column is set per row, so a partial
// index is a fraction of the size and write cost of a full one.

const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

const IDENTITY_METADATA_INDEXES = [
  { name: "idx_identity_metadata_identity_id", column: "identityId", partial: true },
  { name: "idx_identity_metadata_user_id", column: "userId", partial: true },
  { name: "idx_identity_metadata_org_id", column: "orgId", partial: false }
] as const;

const ADDITIONAL_PRIVILEGE_INDEXES = [
  { name: "idx_additional_privileges_actor_identity_id", column: "actorIdentityId", partial: true },
  { name: "idx_additional_privileges_actor_user_id", column: "actorUserId", partial: true },
  { name: "idx_additional_privileges_project_id", column: "projectId", partial: true },
  { name: "idx_additional_privileges_org_id", column: "orgId", partial: true }
] as const;

const INDEX_GROUPS = [
  { table: TableName.IdentityMetadata, indexes: IDENTITY_METADATA_INDEXES },
  { table: TableName.AdditionalPrivilege, indexes: ADDITIONAL_PRIVILEGE_INDEXES }
] as const;

const ALL_INDEXES = [...IDENTITY_METADATA_INDEXES, ...ADDITIONAL_PRIVILEGE_INDEXES];

export async function up(knex: Knex): Promise<void> {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      for (const { table, indexes } of INDEX_GROUPS) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await knex.schema.hasTable(table))) {
          // eslint-disable-next-line no-continue
          continue;
        }

        for (const { name, column, partial } of indexes) {
          // eslint-disable-next-line no-await-in-loop
          if (!(await knex.schema.hasColumn(table, column))) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // A cancelled or failed CREATE INDEX CONCURRENTLY leaves behind an INVALID index.
          // eslint-disable-next-line no-await-in-loop
          const invalid = await raw(
            `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
          );
          if (invalid.rows.length > 0) {
            // eslint-disable-next-line no-await-in-loop
            await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
          }

          // eslint-disable-next-line no-await-in-loop
          await raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON ${table} ("${column}")${
              partial ? ` WHERE "${column}" IS NOT NULL` : ""
            }`
          );
        }
      }
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { name } of ALL_INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  }
}

const config = { transaction: false };
export { config };
