import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Every client registered before this migration was created for the redirect flow.
const REDIRECT_FLOW_GRANT_TYPES = "'{authorization_code,refresh_token}'::text[]";

export async function up(knex: Knex): Promise<void> {
  const hasGrantTypes = await knex.schema.hasColumn(TableName.OauthClient, "grantTypes");
  const hasTokenExchangeAudience = await knex.schema.hasColumn(TableName.OauthClient, "tokenExchangeAudience");
  const hasTokenExchangeIdpSatisfiesMfa = await knex.schema.hasColumn(
    TableName.OauthClient,
    "tokenExchangeIdpSatisfiesMfa"
  );

  if (hasGrantTypes && hasTokenExchangeAudience && hasTokenExchangeIdpSatisfiesMfa) return;

  await knex.schema.alterTable(TableName.OauthClient, (t) => {
    // The default only exists to backfill existing rows. It is dropped below so an insert that omits
    // the column fails instead of silently picking a grant set.
    if (!hasGrantTypes) {
      t.specificType("grantTypes", "text[]").notNullable().defaultTo(knex.raw(REDIRECT_FLOW_GRANT_TYPES));
    }

    // Expected `aud` of subject tokens. This is the application's own registration in the org's IdP,
    // not Infisical's, so it cannot be read from oidc_configs.
    if (!hasTokenExchangeAudience) {
      t.text("tokenExchangeAudience");
    }

    // Token exchange has no Infisical MFA challenge to run, so an admin declares that the IdP
    // enforces it. Without the declaration, exchanges fail for any user who requires MFA.
    if (!hasTokenExchangeIdpSatisfiesMfa) {
      t.boolean("tokenExchangeIdpSatisfiesMfa").notNullable().defaultTo(false);
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

  if (!hasGrantTypes && !hasTokenExchangeAudience && !hasTokenExchangeIdpSatisfiesMfa) return;

  await knex.schema.alterTable(TableName.OauthClient, (t) => {
    if (hasGrantTypes) t.dropColumn("grantTypes");
    if (hasTokenExchangeAudience) t.dropColumn("tokenExchangeAudience");
    if (hasTokenExchangeIdpSatisfiesMfa) t.dropColumn("tokenExchangeIdpSatisfiesMfa");
  });
}
