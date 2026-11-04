import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsRecursive = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "isRecursive");
  if (!hasIsRecursive) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.boolean("isRecursive").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsRecursive = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "isRecursive");
  if (hasIsRecursive) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropColumn("isRecursive");
    });
  }
}
