import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasNhiScanCol = await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "isNhiScanNotificationEnabled");
  if (!hasNhiScanCol) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (t) => {
      t.boolean("isNhiScanNotificationEnabled").notNullable().defaultTo(false);
      t.string("nhiScanChannels", 255).notNullable().defaultTo("");
      t.boolean("isNhiPolicyNotificationEnabled").notNullable().defaultTo(false);
      t.string("nhiPolicyChannels", 255).notNullable().defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasNhiScanCol = await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "isNhiScanNotificationEnabled");
  if (hasNhiScanCol) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (t) => {
      t.dropColumn("isNhiScanNotificationEnabled");
      t.dropColumn("nhiScanChannels");
      t.dropColumn("isNhiPolicyNotificationEnabled");
      t.dropColumn("nhiPolicyChannels");
    });
  }
}
