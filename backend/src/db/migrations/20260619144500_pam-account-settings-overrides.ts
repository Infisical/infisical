import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "settingsOverrides");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.jsonb("settingsOverrides").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "settingsOverrides");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("settingsOverrides");
    });
  }
}
