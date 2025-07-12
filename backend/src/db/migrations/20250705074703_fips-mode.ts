import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasFipsModeColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "fipsEnabled");

  if (!hasFipsModeColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      table.boolean("fipsEnabled").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFipsModeColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "fipsEnabled");

  if (hasFipsModeColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (table) => {
      table.dropColumn("fipsEnabled");
    });
  }
}
