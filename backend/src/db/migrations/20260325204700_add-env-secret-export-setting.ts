import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Environment, "allowSecretExport"))) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      t.boolean("allowSecretExport").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Environment, "allowSecretExport")) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      t.dropColumn("allowSecretExport");
    });
  }
}
