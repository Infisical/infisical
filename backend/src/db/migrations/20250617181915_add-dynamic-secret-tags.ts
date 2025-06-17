import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.DynamicSecret, "tags");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.jsonb("tags").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.DynamicSecret, "tags");
  if (hasCol) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.dropColumn("tags");
    });
  }
}
