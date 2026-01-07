import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUses")) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUsesLimit"))
  ) {
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS idx_identity_access_tokens_num_uses_with_limit
        ON ${TableName.IdentityAccessToken} ("id")
        WHERE "accessTokenNumUsesLimit" > 0
          AND "accessTokenNumUses" >= "identity_access_tokens"."accessTokenNumUsesLimit"
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_num_uses_with_limit
    `);
}
