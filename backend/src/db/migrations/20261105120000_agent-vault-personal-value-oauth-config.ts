import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultPersonalValue, "oauthConfig"))) {
    await knex.schema.alterTable(TableName.AgentVaultPersonalValue, (t) => {
      // The non-secret half of a member's OAuth connection. NULL on every bearer and basic value.
      t.jsonb("oauthConfig");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultPersonalValue, "oauthConfig")) {
    // The column is the only thing that marks these rows as OAuth tokens; without it they read as typed values.
    await knex(TableName.AgentVaultPersonalValue).whereNotNull("oauthConfig").delete();
    await knex.schema.alterTable(TableName.AgentVaultPersonalValue, (t) => {
      t.dropColumn("oauthConfig");
    });
  }
}
