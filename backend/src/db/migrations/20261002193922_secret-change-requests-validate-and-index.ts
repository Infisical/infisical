import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "idx_secret_approval_requests_secrets_v2_secret_change_id";
const COLUMN = "secretChangeId";
const SECRET_CHANGE_FK = "secret_approval_requests_secrets_v2_secretchangeid_foreign";
const REQUEST_XOR_CHANGE_CHECK = "secret_approval_requests_secrets_v2_request_xor_change_check";
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
      (await knex.schema.hasTable(TableName.SecretApprovalRequestSecretV2)) &&
      (await knex.schema.hasColumn(TableName.SecretApprovalRequestSecretV2, COLUMN))
    ) {
      await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
        TableName.SecretApprovalRequestSecretV2,
        REQUEST_XOR_CHANGE_CHECK
      ]);
      await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
        TableName.SecretApprovalRequestSecretV2,
        SECRET_CHANGE_FK
      ]);

      await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}"
        ON ${TableName.SecretApprovalRequestSecretV2} ("${COLUMN}")
        WHERE "${COLUMN}" IS NOT NULL
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

// Validation has no inverse worth running; the previous migration's down drops both constraints.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
