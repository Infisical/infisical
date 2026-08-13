import { Knex } from "knex";

import { TableName } from "../schemas";

// Hosts that pass through even under a block policy, for the things an agent legitimately reaches without a
// credential: a search engine, a package registry, public documentation. Without this, turning blocking on
// forces you to invent a proxied service for every such host just to permit it.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentGateway, "allowedHosts");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AgentGateway, (t) => {
      t.specificType("allowedHosts", "text[]").notNullable().defaultTo("{}");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentGateway, "allowedHosts");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AgentGateway, (t) => {
      t.dropColumn("allowedHosts");
    });
  }
}
