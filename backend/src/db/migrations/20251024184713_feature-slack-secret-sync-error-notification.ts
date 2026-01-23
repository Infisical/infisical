import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "isSecretSyncErrorNotificationEnabled"))) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (table) => {
      table.boolean("isSecretSyncErrorNotificationEnabled").notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "secretSyncErrorChannels"))) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (table) => {
      table.text("secretSyncErrorChannels").notNullable().defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "isSecretSyncErrorNotificationEnabled")) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (table) => {
      table.dropColumn("isSecretSyncErrorNotificationEnabled");
    });
  }

  if (await knex.schema.hasColumn(TableName.ProjectSlackConfigs, "secretSyncErrorChannels")) {
    await knex.schema.alterTable(TableName.ProjectSlackConfigs, (table) => {
      table.dropColumn("secretSyncErrorChannels");
    });
  }
}
