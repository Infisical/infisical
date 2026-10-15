import { Knex } from "knex";

import { TableName } from "../schemas";

const TYPE_CHECK = "agent_vault_services_type_check";
const CREDENTIAL_TYPE_CHECK = "agent_vault_services_credential_type_check";

export async function up(knex: Knex): Promise<void> {
  const hasType = await knex.schema.hasColumn(TableName.AgentVaultService, "type");
  const hasConfig = await knex.schema.hasColumn(TableName.AgentVaultService, "config");

  if (!hasType || !hasConfig) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      if (!hasType) t.string("type", 32).notNullable().defaultTo("http");
      if (!hasConfig) t.jsonb("config").nullable();
    });
  }

  if (!hasType) {
    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultService}" ADD CONSTRAINT "${TYPE_CHECK}" CHECK ("type" IN ('http', 'mcp'))`
    );
  }

  await knex.raw(`ALTER TABLE "${TableName.AgentVaultService}" DROP CONSTRAINT IF EXISTS "${CREDENTIAL_TYPE_CHECK}"`);
  await knex.raw(
    `ALTER TABLE "${TableName.AgentVaultService}" ADD CONSTRAINT "${CREDENTIAL_TYPE_CHECK}" CHECK ("credentialType" IN ('bearer', 'basic', 'passthrough', 'oauth'))`
  );
}

export async function down(knex: Knex): Promise<void> {
  // Restoring the old check fails while an OAuth service exists, so rolling back requires deleting those first.
  await knex.raw(`ALTER TABLE "${TableName.AgentVaultService}" DROP CONSTRAINT IF EXISTS "${CREDENTIAL_TYPE_CHECK}"`);
  await knex.raw(
    `ALTER TABLE "${TableName.AgentVaultService}" ADD CONSTRAINT "${CREDENTIAL_TYPE_CHECK}" CHECK ("credentialType" IN ('bearer', 'basic', 'passthrough'))`
  );

  await knex.raw(`ALTER TABLE "${TableName.AgentVaultService}" DROP CONSTRAINT IF EXISTS "${TYPE_CHECK}"`);

  const hasType = await knex.schema.hasColumn(TableName.AgentVaultService, "type");
  const hasConfig = await knex.schema.hasColumn(TableName.AgentVaultService, "config");

  if (hasType || hasConfig) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      if (hasType) t.dropColumn("type");
      if (hasConfig) t.dropColumn("config");
    });
  }
}
