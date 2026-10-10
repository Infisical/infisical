import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultVariable, "isSecret")) {
    await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
      t.dropColumn("isSecret");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultVariable, "isSecret"))) {
    await knex.schema.alterTable(TableName.AgentVaultVariable, (t) => {
      t.boolean("isSecret").notNullable().defaultTo(true);
    });
  }
}
