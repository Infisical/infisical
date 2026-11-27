import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AlertSlackMessage)) return;

  await knex.schema.createTable(TableName.AlertSlackMessage, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("orgId").notNullable();
    t.uuid("workflowIntegrationId").notNullable();
    t.string("slackChannelId").notNullable();
    t.string("messageTs").notNullable();
    t.string("resourceType").notNullable();
    t.string("targetId").notNullable();
    t.binary("encryptedMessage").notNullable();
    t.timestamps(true, true, true);
    t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    t.foreign("workflowIntegrationId").references("id").inTable(TableName.WorkflowIntegrations).onDelete("CASCADE");
    t.index("orgId");
    t.index("workflowIntegrationId");
    t.index(["resourceType", "targetId"]);
    t.index("createdAt");
  });
  await createOnUpdateTrigger(knex, TableName.AlertSlackMessage);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.AlertSlackMessage);
  await knex.schema.dropTableIfExists(TableName.AlertSlackMessage);
}
