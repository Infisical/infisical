import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEnableGroupSyncCol = await knex.schema.hasColumn(TableName.SamlConfig, "enableGroupSync");

  await knex.schema.alterTable(TableName.SamlConfig, (tb) => {
    if (!hasEnableGroupSyncCol) {
      tb.boolean("enableGroupSync").notNullable().defaultTo(false);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasEnableGroupSyncCol = await knex.schema.hasColumn(TableName.SamlConfig, "enableGroupSync");

  await knex.schema.alterTable(TableName.SamlConfig, (t) => {
    if (hasEnableGroupSyncCol) {
      t.dropColumn("enableGroupSync");
    }
  });
}
