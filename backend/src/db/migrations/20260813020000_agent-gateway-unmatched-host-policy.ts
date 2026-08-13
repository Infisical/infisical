import { Knex } from "knex";

import { TableName } from "../schemas";

// Where traffic goes when no connected proxied service matches the host. It belongs on the agent gateway
// rather than on the command that starts an agent: an agent choosing its own passthrough behaviour is not a
// policy, and the whole point of an allow list is that the agent does not get a say.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentGateway, "unmatchedHostPolicy");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AgentGateway, (t) => {
      // Defaults to allow so existing agent gateways keep working: most of an agent's traffic legitimately
      // needs no credential, and silently blocking it on upgrade would break every running agent.
      t.string("unmatchedHostPolicy", 16).notNullable().defaultTo("allow");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AgentGateway, "unmatchedHostPolicy");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AgentGateway, (t) => {
      t.dropColumn("unmatchedHostPolicy");
    });
  }
}
