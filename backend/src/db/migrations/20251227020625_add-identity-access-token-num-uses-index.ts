import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw("SHOW statement_timeout");
  const originalTimeout = result.rows[0].statement_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    if (
      (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
      (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUses")) &&
      (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUsesLimit"))
    ) {
      await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_num_uses_with_limit
          ON ${TableName.IdentityAccessToken} ("id")
          WHERE "accessTokenNumUsesLimit" > 0
            AND "accessTokenNumUses" >= "${TableName.IdentityAccessToken}"."accessTokenNumUsesLimit"
      `);
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_num_uses_with_limit
    `);
}

const config = { transaction: false };
export { config };
