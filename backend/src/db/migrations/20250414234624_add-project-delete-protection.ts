import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.Project, "hasDeleteProtection");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("hasDeleteProtection").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.Project, "hasDeleteProtection");
  if (hasCol) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("hasDeleteProtection");
    });
  }
}
