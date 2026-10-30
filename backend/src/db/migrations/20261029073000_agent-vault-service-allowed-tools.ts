import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultService, "allowedTools"))) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      // NULL allows every tool, like allowedMethods: an empty array is never stored.
      t.specificType("allowedTools", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultService, "allowedTools")) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.dropColumn("allowedTools");
    });
  }
}
