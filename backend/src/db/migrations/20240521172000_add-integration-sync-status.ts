import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsSyncedColumn = await knex.schema.hasColumn(TableName.Integration, "isSynced");
  const hasSyncMessageColumn = await knex.schema.hasColumn(TableName.Integration, "syncMessage");
  const hasLastSyncJobId = await knex.schema.hasColumn(TableName.Integration, "lastSyncJobId");

  await knex.schema.alterTable(TableName.Integration, (t) => {
    if (!hasIsSyncedColumn) {
      t.boolean("isSynced").nullable();
    }

    if (!hasSyncMessageColumn) {
      t.text("syncMessage").nullable();
    }

    if (!hasLastSyncJobId) {
      t.string("lastSyncJobId").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIsSyncedColumn = await knex.schema.hasColumn(TableName.Integration, "isSynced");
  const hasSyncMessageColumn = await knex.schema.hasColumn(TableName.Integration, "syncMessage");
  const hasLastSyncJobId = await knex.schema.hasColumn(TableName.Integration, "lastSyncJobId");

  await knex.schema.alterTable(TableName.Integration, (t) => {
    if (hasIsSyncedColumn) {
      t.dropColumn("isSynced");
    }

    if (hasSyncMessageColumn) {
      t.dropColumn("syncMessage");
    }

    if (hasLastSyncJobId) {
      t.dropColumn("lastSyncJobId");
    }
  });
}
