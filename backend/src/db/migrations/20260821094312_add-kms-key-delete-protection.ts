import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.KmsKey, "hasDeleteProtection");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.boolean("hasDeleteProtection").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.KmsKey, "hasDeleteProtection");
  if (hasCol) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.dropColumn("hasDeleteProtection");
    });
  }
}
