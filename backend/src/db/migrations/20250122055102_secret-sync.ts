import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretSync))) {
    await knex.schema.createTable(TableName.SecretSync, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("destination").notNullable();
      t.boolean("isAutoSyncEnabled").notNullable().defaultTo(true);
      t.integer("version").defaultTo(1).notNullable();
      t.jsonb("destinationConfig").notNullable();
      t.jsonb("syncOptions").notNullable();
      // we're including projectId in addition to folder ID because we allow folderId to be null (if the folder
      // is deleted), to preserve sync configuration
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("folderId");
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
      // sync secrets to destination
      t.string("syncStatus");
      t.string("lastSyncJobId");
      t.string("lastSyncMessage");
      t.datetime("lastSyncedAt");
      // import secrets from destination
      t.string("importStatus");
      t.string("lastImportJobId");
      t.string("lastImportMessage");
      t.datetime("lastImportedAt");
      // remove secrets from destination
      t.string("removeStatus");
      t.string("lastRemoveJobId");
      t.string("lastRemoveMessage");
      t.datetime("lastRemovedAt");
    });

    await createOnUpdateTrigger(knex, TableName.SecretSync);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretSync);
  await dropOnUpdateTrigger(knex, TableName.SecretSync);
}
