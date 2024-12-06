import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  if (!hasTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  if (hasTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("type");
    });
  }
}
