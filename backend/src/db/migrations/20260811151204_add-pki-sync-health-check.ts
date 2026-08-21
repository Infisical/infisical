import { Knex } from "knex";

import { TableName } from "../schemas";

const HEALTH_CHECK_DISCOVERY_INDEX = "idx_pki_syncs_health_check_discovery";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

const HEALTH_CHECK_COLUMNS = ["lastHealthCheckRanAt", "lastHealthCheckStatus", "lastHealthCheckMessage"] as const;

type HealthCheckColumn = (typeof HEALTH_CHECK_COLUMNS)[number];

const findExistingColumns = async (knex: Knex): Promise<Set<HealthCheckColumn>> => {
  const present = new Set<HealthCheckColumn>();

  for (const column of HEALTH_CHECK_COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn(TableName.PkiSync, column)) present.add(column);
  }

  return present;
};

export async function up(knex: Knex): Promise<void> {
  const existing = await findExistingColumns(knex);

  if (existing.size < HEALTH_CHECK_COLUMNS.length) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      if (!existing.has("lastHealthCheckRanAt")) t.timestamp("lastHealthCheckRanAt", { useTz: true });
      if (!existing.has("lastHealthCheckStatus")) t.string("lastHealthCheckStatus");
      if (!existing.has("lastHealthCheckMessage")) t.string("lastHealthCheckMessage", 1024);
    });
  }

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
        `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${HEALTH_CHECK_DISCOVERY_INDEX}' AND NOT i.indisvalid`
      );
      if (invalid.rows.length > 0) {
        await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${HEALTH_CHECK_DISCOVERY_INDEX}"`);
      }

      await raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${HEALTH_CHECK_DISCOVERY_INDEX}"
        ON ${TableName.PkiSync} ("createdAt")
        WHERE ("syncOptions" ->> 'healthCheckCommand') IS NOT NULL
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
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${HEALTH_CHECK_DISCOVERY_INDEX}"`);

  const existing = await findExistingColumns(knex);

  if (existing.size > 0) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      existing.forEach((column) => t.dropColumn(column));
    });
  }
}

const config = { transaction: false };
export { config };
