import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "usernameTemplate");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.string("usernameTemplate").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "usernameTemplate");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.dropColumn("usernameTemplate");
    });
  }
}
