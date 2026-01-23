import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSync)) {
    const hasLastSyncMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastSyncMessage");
    const hasLastImportMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastImportMessage");
    const hasLastRemoveMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastRemoveMessage");

    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      if (hasLastSyncMessage) t.string("lastSyncMessage", 1024).alter();
      if (hasLastImportMessage) t.string("lastImportMessage", 1024).alter();
      if (hasLastRemoveMessage) t.string("lastRemoveMessage", 1024).alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSync)) {
    const hasLastSyncMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastSyncMessage");
    const hasLastImportMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastImportMessage");
    const hasLastRemoveMessage = await knex.schema.hasColumn(TableName.SecretSync, "lastRemoveMessage");

    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      if (hasLastSyncMessage) t.string("lastSyncMessage").alter();
      if (hasLastImportMessage) t.string("lastImportMessage").alter();
      if (hasLastRemoveMessage) t.string("lastRemoveMessage").alter();
    });
  }
}
