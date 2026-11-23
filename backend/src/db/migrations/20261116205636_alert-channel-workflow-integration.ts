import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AlertChannel, "workflowIntegrationId")) return;

  await knex.schema.alterTable(TableName.AlertChannel, (t) => {
    t.uuid("workflowIntegrationId").nullable();
    t.foreign("workflowIntegrationId").references("id").inTable(TableName.WorkflowIntegrations).onDelete("SET NULL");
    t.index(["workflowIntegrationId"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AlertChannel, "workflowIntegrationId"))) return;

  await knex.schema.alterTable(TableName.AlertChannel, (t) => {
    t.dropForeign(["workflowIntegrationId"]);
    t.dropIndex(["workflowIntegrationId"]);
    t.dropColumn("workflowIntegrationId");
  });
}
