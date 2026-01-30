import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertChannels)) {
    const hasEncryptedConfig = await knex.schema.hasColumn(TableName.PkiAlertChannels, "encryptedConfig");
    if (!hasEncryptedConfig) {
      await knex.schema.alterTable(TableName.PkiAlertChannels, (t) => {
        t.binary("encryptedConfig").nullable();
      });
    }

    await knex.schema.alterTable(TableName.PkiAlertChannels, (t) => {
      t.jsonb("config").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiAlertChannels)) {
    const hasEncryptedConfig = await knex.schema.hasColumn(TableName.PkiAlertChannels, "encryptedConfig");
    if (hasEncryptedConfig) {
      await knex.schema.alterTable(TableName.PkiAlertChannels, (t) => {
        t.dropColumn("encryptedConfig");
      });
    }

    await knex.schema.alterTable(TableName.PkiAlertChannels, (t) => {
      t.jsonb("config").notNullable().alter();
    });
  }
}
