import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
    t.uuid("scopeOrgId").notNullable();
    t.foreign("scopeOrgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
    t.dropColumn("scopeOrgId");
  });
}
