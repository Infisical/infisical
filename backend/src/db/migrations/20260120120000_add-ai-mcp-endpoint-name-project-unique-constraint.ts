import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas/models";

const CONSTRAINT_NAME = "ai_mcp_endpoints_name_project_id_unique";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AiMcpEndpoint)) {
    const hasName = await knex.schema.hasColumn(TableName.AiMcpEndpoint, "name");
    const hasProjectId = await knex.schema.hasColumn(TableName.AiMcpEndpoint, "projectId");

    if (hasName && hasProjectId) {
      // Rename any duplicate endpoints (keep oldest, rename newer ones)
      await knex.raw(`
        UPDATE ${TableName.AiMcpEndpoint} e1
        SET "name" = e1."name" || '-' || substr(md5(random()::text), 1, 4)
        WHERE EXISTS (
          SELECT 1 FROM ${TableName.AiMcpEndpoint} e2
          WHERE e2."projectId" = e1."projectId"
            AND e2."name" = e1."name"
            AND e2."createdAt" < e1."createdAt"
        )
      `);

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
