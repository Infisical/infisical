import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Sandbox, "agentModel");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      // Null means "whatever the agent's default is", so sandboxes created before this keep working.
      t.string("agentModel", 128).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Sandbox, "agentModel");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      t.dropColumn("agentModel");
    });
  }
}
