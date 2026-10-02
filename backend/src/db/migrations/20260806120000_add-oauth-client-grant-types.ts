import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Every client registered before this migration was created for the redirect flow.
const REDIRECT_FLOW_GRANT_TYPES = "'{authorization_code,refresh_token}'::text[]";

// One day. Deliberately shorter than JWT_AUTH_LIFETIME (10 days), which is what these tokens fell back
// to before the column existed.
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 86400;

export async function up(knex: Knex): Promise<void> {
  const hasGrantTypes = await knex.schema.hasColumn(TableName.OauthClient, "grantTypes");
  const hasTokenExchangeAudience = await knex.schema.hasColumn(TableName.OauthClient, "tokenExchangeAudience");
  const hasTokenExchangeIdpSatisfiesMfa = await knex.schema.hasColumn(
    TableName.OauthClient,
    "tokenExchangeIdpSatisfiesMfa"
  );
  const hasAccessTokenTtl = await knex.schema.hasColumn(TableName.OauthClient, "accessTokenTTL");

  if (hasGrantTypes && hasTokenExchangeAudience && hasTokenExchangeIdpSatisfiesMfa && hasAccessTokenTtl) return;

  await knex.schema.alterTable(TableName.OauthClient, (t) => {
    // The default is only here to backfill existing rows, and gets dropped below so an insert that
    // omits the column fails instead of silently picking a grant set.
    if (!hasGrantTypes) {
      t.specificType("grantTypes", "text[]").notNullable().defaultTo(knex.raw(REDIRECT_FLOW_GRANT_TYPES));
    }

    // Expected `aud` of subject tokens. It is the application's own registration in the org's IdP, not
    // Infisical's, so it cannot be read off oidc_configs.
    if (!hasTokenExchangeAudience) {
      t.text("tokenExchangeAudience");
    }

    // Token exchange has no Infisical MFA challenge to run, so an admin vouches that the IdP enforces it.
    // Without that, exchanges fail for any user who requires MFA.
    if (!hasTokenExchangeIdpSatisfiesMfa) {
      t.boolean("tokenExchangeIdpSatisfiesMfa").notNullable().defaultTo(false);
    }

    // Unlike grantTypes, the default is kept: a create that omits it should get the product default
    // rather than fail.
    if (!hasAccessTokenTtl) {
      t.integer("accessTokenTTL").notNullable().defaultTo(DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
    }
  });

  if (!hasGrantTypes) {
    await knex.raw('ALTER TABLE ?? ALTER COLUMN "grantTypes" DROP DEFAULT', [TableName.OauthClient]);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGrantTypes = await knex.schema.hasColumn(TableName.OauthClient, "grantTypes");
  const hasTokenExchangeAudience = await knex.schema.hasColumn(TableName.OauthClient, "tokenExchangeAudience");
  const hasTokenExchangeIdpSatisfiesMfa = await knex.schema.hasColumn(
    TableName.OauthClient,
    "tokenExchangeIdpSatisfiesMfa"
  );
  const hasAccessTokenTtl = await knex.schema.hasColumn(TableName.OauthClient, "accessTokenTTL");

  if (!hasGrantTypes && !hasTokenExchangeAudience && !hasTokenExchangeIdpSatisfiesMfa && !hasAccessTokenTtl) return;

  await knex.schema.alterTable(TableName.OauthClient, (t) => {
    if (hasGrantTypes) t.dropColumn("grantTypes");
    if (hasTokenExchangeAudience) t.dropColumn("tokenExchangeAudience");
    if (hasTokenExchangeIdpSatisfiesMfa) t.dropColumn("tokenExchangeIdpSatisfiesMfa");
    if (hasAccessTokenTtl) t.dropColumn("accessTokenTTL");
  });
}
