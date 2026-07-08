import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamFolderNotificationConfig)) return;

  await knex.schema.createTable(TableName.PamFolderNotificationConfig, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("folderId").notNullable();
    t.foreign("folderId").references("id").inTable(TableName.PamFolder).onDelete("CASCADE");
    t.index(["folderId"]);
    t.uuid("workflowIntegrationId").notNullable();
    t.foreign("workflowIntegrationId").references("id").inTable(TableName.WorkflowIntegrations).onDelete("CASCADE");
    t.index(["workflowIntegrationId"]);
    // [{ id, name }] channel objects; names are stored so the UI can render chips for viewers
    // who lack org Settings read (the Slack channel-list API), and so Teams can extend the
    // object shape (e.g. teamId) without a schema change.
    t.jsonb("channels").notNullable();
    t.jsonb("events").notNullable();
    t.timestamps(true, true, true);
  });

  await createOnUpdateTrigger(knex, TableName.PamFolderNotificationConfig);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.PamFolderNotificationConfig);
  await knex.schema.dropTableIfExists(TableName.PamFolderNotificationConfig);
}
