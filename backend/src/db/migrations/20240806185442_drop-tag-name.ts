import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasNameField = await knex.schema.hasColumn(TableName.SecretTag, "name");
  if (hasNameField) {
    await knex.schema.alterTable(TableName.SecretTag, (t) => {
      t.dropColumn("name");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasNameField = await knex.schema.hasColumn(TableName.SecretTag, "name");
  if (!hasNameField) {
    await knex.schema.alterTable(TableName.SecretTag, (t) => {
      t.string("name");
    });
  }
}
