import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsExportableColumn = await knex.schema.hasColumn(TableName.KmsKey, "isExportable");

  if (!hasIsExportableColumn) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.boolean("isExportable").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsExportableColumn = await knex.schema.hasColumn(TableName.KmsKey, "isExportable");

  if (hasIsExportableColumn) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.dropColumn("isExportable");
    });
  }
}
