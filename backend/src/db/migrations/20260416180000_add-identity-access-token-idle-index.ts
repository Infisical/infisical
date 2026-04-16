import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
      (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenLastUsedAt"))
    ) {
      // No AT TIME ZONE 'UTC' cast here — COALESCE(timestamptz, timestamptz)
      // returns timestamptz, which is already immutable for index purposes.
      // The existing expiration index applies AT TIME ZONE to convert to
      // timestamp (no-tz) before arithmetic; we skip that cast so the query
      // predicate can compare timestamptz directly without a matching cast.
      await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_idle
          ON ${TableName.IdentityAccessToken} (
              (COALESCE("accessTokenLastUsedAt", "createdAt"))
          )
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_idle
    `);
}

const config = { transaction: false };
export { config };
