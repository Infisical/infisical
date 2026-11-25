import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamFolder, "emailApproversOnRequest"))) {
    await knex.schema.alterTable(TableName.PamFolder, (t) => {
      t.boolean("emailApproversOnRequest").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamFolder, "emailApproversOnRequest")) {
    await knex.schema.alterTable(TableName.PamFolder, (t) => {
      t.dropColumn("emailApproversOnRequest");
    });
  }
}
