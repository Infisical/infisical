import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccountDependency, "isEnabled");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.renameColumn("isEnabled", "isRotationSyncEnabled");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccountDependency, "isRotationSyncEnabled");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamAccountDependency, (t) => {
      t.renameColumn("isRotationSyncEnabled", "isEnabled");
    });
  }
}
