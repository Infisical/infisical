import { Knex } from "knex";

import { TableName } from "../schemas";

const UNIQUE_INDEX = "alert_unique_scope_resource_event";
const RESOURCE_BOUND_UNIQUE_INDEX = "alert_unique_scope_resource_event_bound";
const ORG_ID_INDEX = "alerts_orgid_index";
const MIGRATION_TIMEOUT = 60 * 60 * 1000;
const MIGRATION_LOCK_TIMEOUT = 30 * 1000;

const UNIQUE_COLUMNS = `("orgId", (COALESCE("projectId", '')), "resourceType", (COALESCE("resourceId", '')), "eventType")`;

const withMigrationConnection = async (knex: Knex, run: (raw: (sql: string) => Knex.Raw) => Promise<void>) => {
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
      await run(raw);
    } finally {
      await raw(`SET statement_timeout = '${originalStatementTimeout}'`);
      await raw(`SET lock_timeout = '${originalLockTimeout}'`);
    }
  } finally {
    await knex.client.releaseConnection(connection);
  }
};

const createIndexConcurrently = async (raw: (sql: string) => Knex.Raw, name: string, definition: string) => {
  const invalid = await raw(
    `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${name}' AND NOT i.indisvalid`
  );
  if (invalid.rows.length > 0) await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
  await raw(`CREATE ${definition}`);
};

export async function up(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      ORG_ID_INDEX,
      `INDEX CONCURRENTLY IF NOT EXISTS "${ORG_ID_INDEX}" ON "${TableName.Alert}" ("orgId")`
    );
    await createIndexConcurrently(
      raw,
      RESOURCE_BOUND_UNIQUE_INDEX,
      `UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${RESOURCE_BOUND_UNIQUE_INDEX}" ON "${TableName.Alert}" ${UNIQUE_COLUMNS} WHERE "resourceId" IS NOT NULL`
    );
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${UNIQUE_INDEX}"`);
  });
}

export async function down(knex: Knex): Promise<void> {
  await withMigrationConnection(knex, async (raw) => {
    await createIndexConcurrently(
      raw,
      UNIQUE_INDEX,
      `UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${UNIQUE_INDEX}" ON "${TableName.Alert}" ${UNIQUE_COLUMNS}`
    );
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${RESOURCE_BOUND_UNIQUE_INDEX}"`);
    await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${ORG_ID_INDEX}"`);
  });
}

const config = { transaction: false };
export { config };
