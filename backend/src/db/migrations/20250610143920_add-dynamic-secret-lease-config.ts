import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasConfigColumn = await knex.schema.hasColumn(TableName.DynamicSecretLease, "config");
  if (!hasConfigColumn) {
    await knex.schema.alterTable(TableName.DynamicSecretLease, (table) => {
      table.jsonb("config");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasConfigColumn = await knex.schema.hasColumn(TableName.DynamicSecretLease, "config");
  if (hasConfigColumn) {
    await knex.schema.alterTable(TableName.DynamicSecretLease, (table) => {
      table.dropColumn("config");
    });
  }
}
