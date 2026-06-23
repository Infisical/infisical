import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "recordingSettings");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.jsonb("recordingSettings").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamAccount, "recordingSettings");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("recordingSettings");
    });
  }
}
