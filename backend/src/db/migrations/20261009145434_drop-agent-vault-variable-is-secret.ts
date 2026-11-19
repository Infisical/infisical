import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultVariable, "isSecret")) {
    // The analytics view selects this column, and Postgres won't drop a column a view uses. Startup only clears the
    // analytics schema when it regenerates it, so a migration run without that step would fail here. The next
    // regeneration recreates the view without the column.
    await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultVariable]);
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
