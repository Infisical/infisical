import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "idx_secret_approval_requests_secrets_v2_request_id";
const COLUMN = "requestId";
const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

export async function up(knex: Knex): Promise<void> {
  const connection = await knex.client.acquireConnection();
  const raw = (sql: string, bindings: readonly Knex.RawBinding[] = []) =>
    knex.raw(sql, bindings).connection(connection);

  try {
    const stmtResult = await raw("SHOW statement_timeout");
    const originalStatementTimeout = stmtResult.rows[0].statement_timeout as string;
    const lockResult = await raw("SHOW lock_timeout");
    const originalLockTimeout = lockResult.rows[0].lock_timeout as string;

    try {
      await raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
      await raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

      if (
        (await knex.schema.hasTable(TableName.SecretApprovalRequestSecretV2)) &&
        (await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, COLUMN))
      ) {
        const invalid = await raw(
          `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${INDEX_NAME}' AND NOT i.indisvalid`
        );
        if (invalid.rows.length > 0) {
          await raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
        }

        await raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
          ON ${TableName.SecretApprovalRequestSecretV2} ("${COLUMN}")
          WHERE "${COLUMN}" IS NOT NULL
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
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
