import { Knex } from "knex";

import { TableName } from "../schemas";

const PREFLIGHT_DISCOVERY_INDEX = "idx_pki_syncs_preflight_discovery";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

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

      const invalid = await raw(
        `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${PREFLIGHT_DISCOVERY_INDEX}' AND NOT i.indisvalid`
      );
      if (invalid.rows.length > 0) {
        await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${PREFLIGHT_DISCOVERY_INDEX}"`);
      }

      await raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${PREFLIGHT_DISCOVERY_INDEX}"
        ON ${TableName.PkiSync} ("createdAt")
        WHERE ("syncOptions" ->> 'preflightCommand') IS NOT NULL
      `);
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${PREFLIGHT_DISCOVERY_INDEX}"`);
}

const config = { transaction: false };
export { config };
