import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "agentVaultSessionId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("agentVaultSessionId");
      tb.foreign("agentVaultSessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");
      tb.index("agentVaultSessionId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "agentVaultSessionId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("agentVaultSessionId");
    });
  }
}
