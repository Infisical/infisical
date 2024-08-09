import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Identity, "isDisabled"))) {
    await knex.schema.alterTable(TableName.Identity, (tb) => {
      tb.boolean("isDisabled").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Identity, "isDisabled")) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("isDisabled");
    });
  }
}
