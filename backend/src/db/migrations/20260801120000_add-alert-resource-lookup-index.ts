import { Knex } from "knex";

import { TableName } from "../schemas";

// Reaping a deleted resource's alerts (deleteAlertsForDeletedResource, on every identity delete)
// filters alerts on resourceType + resourceId alone — no orgId or projectId to narrow it — so
// without this index it seq-scans the whole table once per delete. resourceType leads so the
// composite also serves the resourceType-only lookups (findEnabledByResourceType, and the
// resourceType predicate in findActiveByScope / findScopedDuplicate) as a leftmost prefix.
const RESOURCE_LOOKUP_INDEX = "idx_alerts_resource_type_resource_id";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  // statement_timeout / lock_timeout are session-local, so every statement here has to run on the
  // same pooled connection as the CREATE INDEX CONCURRENTLY it is meant to govern.
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

      if (await knex.schema.hasColumn(TableName.Alert, "resourceId")) {
        // A cancelled or failed CREATE INDEX CONCURRENTLY leaves behind an INVALID index that
        // IF NOT EXISTS would happily skip over, so drop it before retrying.
        const invalid = await raw(
          `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${RESOURCE_LOOKUP_INDEX}' AND NOT i.indisvalid`
        );
        if (invalid.rows.length > 0) {
          await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${RESOURCE_LOOKUP_INDEX}"`);
        }

        await raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${RESOURCE_LOOKUP_INDEX}"
          ON ${TableName.Alert} ("resourceType", "resourceId")
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
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${RESOURCE_LOOKUP_INDEX}"`);
}

const config = { transaction: false };
export { config };
