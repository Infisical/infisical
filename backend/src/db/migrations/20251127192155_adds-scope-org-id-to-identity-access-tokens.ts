import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasScopeOrgIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "scopeOrgId");
  if (!hasScopeOrgIdColumn) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.uuid("scopeOrgId");
      t.foreign("scopeOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasScopeOrgIdColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "scopeOrgId");
  if (hasScopeOrgIdColumn) {
    await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
      t.dropColumn("scopeOrgId");
    });
  }
}
