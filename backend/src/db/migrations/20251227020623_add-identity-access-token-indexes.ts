import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenTTL")) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenLastRenewedAt"))
  ) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_expiration
        ON ${TableName.IdentityAccessToken} (
            (COALESCE("accessTokenLastRenewedAt", "createdAt") AT TIME ZONE 'UTC' + make_interval(secs => LEAST(
            "identity_access_tokens"."accessTokenTTL",
            '315360000'
            )))
        )
        WHERE "accessTokenTTL" > 0
    `);
  }

  if (
    (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "isAccessTokenRevoked"))
  ) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_revoked
        ON ${TableName.IdentityAccessToken} ("isAccessTokenRevoked")
        WHERE "isAccessTokenRevoked" = true
    `);
  }

  if (
    (await knex.schema.hasTable(TableName.IdentityAccessToken)) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUses")) &&
    (await knex.schema.hasColumn(TableName.IdentityAccessToken, "accessTokenNumUsesLimit"))
  ) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_access_tokens_num_uses_with_limit
        ON ${TableName.IdentityAccessToken} ("accessTokenNumUses")
        WHERE "accessTokenNumUsesLimit" > 0
          AND "accessTokenNumUses" >= "identity_access_tokens"."accessTokenNumUsesLimit"
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_expiration
    `);

  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_revoked
    `);

  await knex.raw(`
      DROP INDEX IF EXISTS idx_identity_access_tokens_num_uses_with_limit
    `);
}
