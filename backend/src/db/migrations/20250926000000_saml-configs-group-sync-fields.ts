import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEnableGroupSyncCol = await knex.schema.hasColumn(TableName.SamlConfig, "enableGroupSync");

  if (!hasEnableGroupSyncCol) {
    await knex.schema.alterTable(TableName.SamlConfig, (tb) => {
      tb.boolean("enableGroupSync").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEnableGroupSyncCol = await knex.schema.hasColumn(TableName.SamlConfig, "enableGroupSync");

  if (hasEnableGroupSyncCol) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      t.dropColumn("enableGroupSync");
    });
  }
}
