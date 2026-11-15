import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentVaultSession, "label");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.string("label", 128).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentVaultSession, "label");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AgentVaultSession, (t) => {
      t.dropColumn("label");
    });
  }
}
