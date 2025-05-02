import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "invalidatingCache");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.boolean("invalidatingCache").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SuperAdmin, "invalidatingCache");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("invalidatingCache");
    });
  }
}
