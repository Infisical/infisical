import { Knex } from "knex";

import { TableName } from "../schemas";

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
      (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
      (await knex.schema.hasColumn(TableName.IdentityAccessToken, "subOrganizationId"))
    ) {
      await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_sub_organization_id
          ON ${TableName.IdentityAccessToken} ("subOrganizationId")
          WHERE "subOrganizationId" IS NOT NULL
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_sub_organization_id
    `);
}

const config = { transaction: false };
export { config };
