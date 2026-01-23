import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiSync))) {
    await knex.schema.createTable(TableName.PkiSync, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name", 32).notNullable();
      t.string("description");
      t.string("destination").notNullable();
      t.boolean("isAutoSyncEnabled").notNullable().defaultTo(true);
      t.integer("version").defaultTo(1).notNullable();
      t.jsonb("destinationConfig").notNullable();
      t.jsonb("syncOptions").notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.uuid("subscriberId");
      t.foreign("subscriberId").references("id").inTable(TableName.PkiSubscriber).onDelete("SET NULL");
      t.uuid("connectionId").notNullable();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
      t.string("syncStatus");
      t.string("lastSyncJobId");
      t.string("lastSyncMessage");
      t.datetime("lastSyncedAt");
      t.string("importStatus");
      t.string("lastImportJobId");
      t.string("lastImportMessage");
      t.datetime("lastImportedAt");
      t.string("removeStatus");
      t.string("lastRemoveJobId");
      t.string("lastRemoveMessage");
      t.datetime("lastRemovedAt");

      t.unique(["name", "projectId"], { indexName: "pki_syncs_name_project_id_unique" });
    });

    await createOnUpdateTrigger(knex, TableName.PkiSync);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PkiSync);
  await dropOnUpdateTrigger(knex, TableName.PkiSync);
}
