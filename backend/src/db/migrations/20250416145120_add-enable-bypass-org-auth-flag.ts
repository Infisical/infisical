import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "bypassOrgAuthEnabled"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.boolean("bypassOrgAuthEnabled").defaultTo(false).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "bypassOrgAuthEnabled")) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("bypassOrgAuthEnabled");
    });
  }
}
