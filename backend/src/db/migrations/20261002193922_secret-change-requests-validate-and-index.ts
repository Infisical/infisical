import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "idx_secret_approval_requests_secrets_v2_secret_change_id";
const COLUMN = "secretChangeId";
const SECRET_CHANGE_FK = "secret_approval_requests_secrets_v2_secretchangeid_foreign";
const REQUEST_XOR_CHANGE_CHECK = "secret_approval_requests_secrets_v2_request_xor_change_check";
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
        await raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
          TableName.SecretApprovalRequestSecretV2,
          REQUEST_XOR_CHANGE_CHECK
        ]);
        await raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [TableName.SecretApprovalRequestSecretV2, SECRET_CHANGE_FK]);

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

// Validation has no inverse worth running; the previous migration's down drops both constraints.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
