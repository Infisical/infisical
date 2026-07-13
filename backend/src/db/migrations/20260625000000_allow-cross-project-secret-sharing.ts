import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "allowCrossProjectSecretSharing");
  if (!hasColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.boolean("allowCrossProjectSecretSharing").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Organization, "allowCrossProjectSecretSharing");
  if (hasColumn) {
    await knex.schema.table(TableName.Organization, (table) => {
      table.dropColumn("allowCrossProjectSecretSharing");
    });
  }
}
