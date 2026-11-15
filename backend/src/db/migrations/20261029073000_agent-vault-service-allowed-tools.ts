import { Knex } from "knex";

import { TableName } from "../schemas";

// Each rule column holds NULL (no restriction) or a non-empty list, and only on the service type it applies to: the
// proxy reads an empty list as "allow nothing", and the Go backend shares this table without the API's checks.
const RULE_CHECKS = [
  {
    name: "agent_vault_services_allowed_tools_check",
    check: `"allowedTools" IS NULL OR (cardinality("allowedTools") > 0 AND "type" = 'mcp')`
  },
  {
    name: "agent_vault_services_allowed_methods_check",
    check: `"allowedMethods" IS NULL OR (cardinality("allowedMethods") > 0 AND "type" = 'http')`
  },
  {
    name: "agent_vault_services_allowed_path_prefixes_check",
    check: `"allowedPathPrefixes" IS NULL OR (cardinality("allowedPathPrefixes") > 0 AND "type" = 'http')`
  }
];

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultService, "allowedTools"))) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      // NULL allows every tool, like allowedMethods: an empty array is never stored.
      t.specificType("allowedTools", "text[]");
    });
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const { name, check } of RULE_CHECKS) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.AgentVaultService, name]);
    // NOT VALID first, so one stray older row can't fail the deploy; new writes are checked either way.
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${check}) NOT VALID`, [TableName.AgentVaultService, name]);
    // eslint-disable-next-line no-await-in-loop
    const violation = await knex(TableName.AgentVaultService).whereRaw(`NOT (${check})`).first("id");
    if (!violation) {
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [TableName.AgentVaultService, name]);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (const { name } of RULE_CHECKS) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [TableName.AgentVaultService, name]);
  }
  if (await knex.schema.hasColumn(TableName.AgentVaultService, "allowedTools")) {
    await knex.schema.alterTable(TableName.AgentVaultService, (t) => {
      t.dropColumn("allowedTools");
    });
  }
}
