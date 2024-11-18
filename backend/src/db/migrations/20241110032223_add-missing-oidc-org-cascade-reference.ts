import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.OidcConfig, "orgId")) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.dropForeign("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.OidcConfig, "orgId")) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      t.dropForeign("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization);
    });
  }
}
