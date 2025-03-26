import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.SecretFolder, "lastSecretModified");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.datetime("lastSecretModified");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.SecretFolder, "lastSecretModified");
  if (hasCol) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.dropColumn("lastSecretModified");
    });
  }
}
