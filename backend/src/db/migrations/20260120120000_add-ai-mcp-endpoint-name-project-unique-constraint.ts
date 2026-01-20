import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas";

const CONSTRAINT_NAME = "ai_mcp_endpoints_name_project_id_unique";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AiMcpEndpoint)) {
    const hasName = await knex.schema.hasColumn(TableName.AiMcpEndpoint, "name");
    const hasProjectId = await knex.schema.hasColumn(TableName.AiMcpEndpoint, "projectId");

    if (hasName && hasProjectId) {
      await knex.schema.alterTable(TableName.AiMcpEndpoint, (table) => {
        table.unique(["name", "projectId"], { indexName: CONSTRAINT_NAME });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AiMcpEndpoint)) {
    await dropConstraintIfExists(TableName.AiMcpEndpoint, CONSTRAINT_NAME, knex);
  }
}
