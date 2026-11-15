import { Knex } from "knex";

import { TableName } from "../schemas";

// Text rather than a varchar like the other Agent Vault descriptions: the API holds the limit, so raising it needs no
// migration.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultService, "description"))) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.text("description").nullable();
    });
  }
  if (!(await knex.schema.hasColumn(TableName.AgentVaultSessionInlineService, "description"))) {
    await knex.schema.alterTable(TableName.AgentVaultSessionInlineService, (t) => {
      t.text("description").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultSessionInlineService, "description")) {
    await knex.schema.alterTable(TableName.AgentVaultSessionInlineService, (t) => {
      t.dropColumn("description");
    });
  }
  if (await knex.schema.hasColumn(TableName.AgentVaultService, "description")) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.dropColumn("description");
    });
  }
}
