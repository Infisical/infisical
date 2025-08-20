import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasMigratingFromColumn = await knex.schema.hasColumn(TableName.Organization, "migratingFrom");

  if (!hasMigratingFromColumn) {
    await knex.schema.alterTable(TableName.Organization, (table) => {
      table.string("migratingFrom").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasMigratingFromColumn = await knex.schema.hasColumn(TableName.Organization, "migratingFrom");

  if (hasMigratingFromColumn) {
    await knex.schema.alterTable(TableName.Organization, (table) => {
      table.dropColumn("migratingFrom");
    });
  }
}
