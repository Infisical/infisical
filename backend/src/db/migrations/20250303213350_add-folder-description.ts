import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.SecretFolder, "description");

  if (!hasProjectDescription) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.string("description");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.SecretFolder, "description");

  if (hasProjectDescription) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.dropColumn("description");
    });
  }
}
