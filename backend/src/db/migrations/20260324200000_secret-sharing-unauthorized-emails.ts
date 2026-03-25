import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "externalEmails");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.json("externalEmails").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretSharing, "externalEmails");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.dropColumn("externalEmails");
    });
  }
}
