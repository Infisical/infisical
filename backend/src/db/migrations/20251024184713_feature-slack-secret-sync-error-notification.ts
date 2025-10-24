import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn("project_slack_configs", "isSecretSyncErrorNotificationEnabled"))) {
    await knex.schema.alterTable("project_slack_configs", (table) => {
      table.boolean("isSecretSyncErrorNotificationEnabled").notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasColumn("project_slack_configs", "secretSyncErrorChannels"))) {
    await knex.schema.alterTable("project_slack_configs", (table) => {
      table.text("secretSyncErrorChannels").notNullable().defaultTo("");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn("project_slack_configs", "isSecretSyncErrorNotificationEnabled")) {
    await knex.schema.alterTable("project_slack_configs", (table) => {
      table.dropColumn("isSecretSyncErrorNotificationEnabled");
    });
  }

  if (await knex.schema.hasColumn("project_slack_configs", "secretSyncErrorChannels")) {
    await knex.schema.alterTable("project_slack_configs", (table) => {
      table.dropColumn("secretSyncErrorChannels");
    });
  }
}
