import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "allowExternalEmails");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.boolean("allowExternalEmails").nullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "allowExternalEmails");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.dropColumn("allowExternalEmails");
    });
  }
}
