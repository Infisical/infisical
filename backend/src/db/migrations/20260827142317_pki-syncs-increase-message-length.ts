import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiSync)) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.string("lastSyncMessage", 1024).alter();
      t.string("lastImportMessage", 1024).alter();
      t.string("lastRemoveMessage", 1024).alter();
    });
  }
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
