import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultProxy, "description"))) {
    await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
      t.string("description", 256).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultProxy, "description")) {
    await knex.schema.alterTable(TableName.AgentVaultProxy, (t) => {
      t.dropColumn("description");
    });
  }
}
