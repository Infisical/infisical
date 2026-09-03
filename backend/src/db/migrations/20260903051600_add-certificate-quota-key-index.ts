import { Knex } from "knex";

import { TableName } from "../schemas";

const QUOTA_KEY_INDEX = "certificates_projectid_quotakey_index";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

// Serves both quota queries: the point probe and the COUNT(DISTINCT) that fills the quota cache.
// notAfter, status and extendedKeyUsages are INCLUDE columns so the count stays an index-only scan;
// without them every candidate row needs a heap fetch, which is material at tens of thousands.
export async function up(knex: Knex): Promise<void> {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string) => knex.raw(sql).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout as string;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout as string;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      if (await knex.schema.hasColumn(TableName.Certificate, "quotaKey")) {
        // An interrupted CREATE INDEX CONCURRENTLY leaves an invalid index that is never used but is
        // still maintained on write, and IF NOT EXISTS would skip past it.
        const invalid = await raw(
          `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${QUOTA_KEY_INDEX}' AND NOT i.indisvalid`
        );
        if (invalid.rows.length > 0) {
          await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${QUOTA_KEY_INDEX}"`);
        }

        await raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${QUOTA_KEY_INDEX}"
          ON "${TableName.Certificate}" ("projectId", "quotaKey")
          INCLUDE ("notAfter", "status", "extendedKeyUsages")
        `);
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
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${QUOTA_KEY_INDEX}"`);
}

const config = { transaction: false };
export { config };
