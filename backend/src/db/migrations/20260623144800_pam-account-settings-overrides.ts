import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasRecordingSettings = await knex.schema.hasColumn(TableName.PamAccount, "recordingSettings");
  const hasSettingsOverrides = await knex.schema.hasColumn(TableName.PamAccount, "settingsOverrides");

  if (hasRecordingSettings && !hasSettingsOverrides) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.renameColumn("recordingSettings", "settingsOverrides");
    });
    return;
  }

  if (!hasSettingsOverrides) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.jsonb("settingsOverrides").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRecordingSettings = await knex.schema.hasColumn(TableName.PamAccount, "recordingSettings");
  const hasSettingsOverrides = await knex.schema.hasColumn(TableName.PamAccount, "settingsOverrides");

  if (hasSettingsOverrides && !hasRecordingSettings) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.renameColumn("settingsOverrides", "recordingSettings");
    });
    return;
  }

  if (hasSettingsOverrides) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("settingsOverrides");
    });
  }
}
