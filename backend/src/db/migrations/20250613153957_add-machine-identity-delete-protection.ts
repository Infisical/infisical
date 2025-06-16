import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.Identity, "hasDeleteProtection");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.boolean("hasDeleteProtection").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.Identity, "hasDeleteProtection");
  if (hasCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("hasDeleteProtection");
    });
  }
}
