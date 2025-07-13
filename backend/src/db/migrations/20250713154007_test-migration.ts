import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
    table.string("test_column").notNullable().defaultTo("test_value");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
    table.dropColumn("test_column");
  });
}
