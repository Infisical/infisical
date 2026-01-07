import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "isAccessTokenRevoked"))
  ) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_revoked
        ON ${TableName.IdentityAccessToken} ("id")
        WHERE "isAccessTokenRevoked" = 't'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_revoked
    `);
}
