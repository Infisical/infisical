import { Knex } from "knex";

import { TableName } from "../schemas";

const GOOGLE_SSO_AUTH_ENFORCED_COLUMN_NAME = "googleSsoAuthEnforced";
const GOOGLE_SSO_AUTH_LAST_USED_COLUMN_NAME = "googleSsoAuthLastUsed";
export async function up(knex: Knex): Promise<void> {
  const hasGoogleSsoAuthEnforcedColumn = await knex.schema.hasColumn(
    TableName.Organization,
    GOOGLE_SSO_AUTH_ENFORCED_COLUMN_NAME
  );
  const hasGoogleSsoAuthLastUsedColumn = await knex.schema.hasColumn(
    TableName.Organization,
    GOOGLE_SSO_AUTH_LAST_USED_COLUMN_NAME
  );

  await knex.schema.alterTable(TableName.Organization, (table) => {
    if (!hasGoogleSsoAuthEnforcedColumn) table.boolean(GOOGLE_SSO_AUTH_ENFORCED_COLUMN_NAME).defaultTo(false);
    if (!hasGoogleSsoAuthLastUsedColumn) table.timestamp(GOOGLE_SSO_AUTH_LAST_USED_COLUMN_NAME).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasGoogleSsoAuthEnforcedColumn = await knex.schema.hasColumn(
    TableName.Organization,
    GOOGLE_SSO_AUTH_ENFORCED_COLUMN_NAME
  );

  const hasGoogleSsoAuthLastUsedColumn = await knex.schema.hasColumn(
    TableName.Organization,
    GOOGLE_SSO_AUTH_LAST_USED_COLUMN_NAME
  );

  await knex.schema.alterTable(TableName.Organization, (table) => {
    if (hasGoogleSsoAuthEnforcedColumn) table.dropColumn(GOOGLE_SSO_AUTH_ENFORCED_COLUMN_NAME);
    if (hasGoogleSsoAuthLastUsedColumn) table.dropColumn(GOOGLE_SSO_AUTH_LAST_USED_COLUMN_NAME);
  });
}
