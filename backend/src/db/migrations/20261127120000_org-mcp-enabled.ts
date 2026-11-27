import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "mcpEnabled");
  if (!hasColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.boolean("mcpEnabled").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "mcpEnabled");
  if (hasColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.dropColumn("mcpEnabled");
    });
  }
}
