import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretSync))) {
    await knex.schema.createTable(TableName.SecretSync, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("destination").notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);
      t.integer("version").defaultTo(1).notNullable();
      t.jsonb("destinationConfig").notNullable();
      t.jsonb("syncOptions").notNullable();
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
      // sync
      t.string("syncStatus");
      t.string("lastSyncJobId");
      t.string("lastSyncMessage");
      t.datetime("lastSyncedAt");
      // import
      t.string("importStatus");
      t.string("lastImportJobId");
      t.string("lastImportMessage");
      t.datetime("lastImportedAt");
      // erase
      t.string("eraseStatus");
      t.string("lastEraseJobId");
      t.string("lastEraseMessage");
      t.datetime("lastErasedAt");
    });

    await createOnUpdateTrigger(knex, TableName.SecretSync);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretSync);
  await dropOnUpdateTrigger(knex, TableName.SecretSync);
}
