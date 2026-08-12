import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAgentType = await knex.schema.hasColumn(TableName.Sandbox, "agentType");
  const hasAgentToken = await knex.schema.hasColumn(TableName.Sandbox, "encryptedAgentToken");

  if (!hasAgentType || !hasAgentToken) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      // Which coding agent runs in the sandbox, and its own provider key. The key is the one
      // credential the sandbox legitimately holds, so it is KMS-encrypted like any other.
      if (!hasAgentType) t.string("agentType");
      if (!hasAgentToken) t.binary("encryptedAgentToken");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAgentType = await knex.schema.hasColumn(TableName.Sandbox, "agentType");
  const hasAgentToken = await knex.schema.hasColumn(TableName.Sandbox, "encryptedAgentToken");

  if (hasAgentType || hasAgentToken) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      if (hasAgentType) t.dropColumn("agentType");
      if (hasAgentToken) t.dropColumn("encryptedAgentToken");
    });
  }
}
