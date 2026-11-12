import { Knex } from "knex";

import { TableName } from "../schemas";

const SERVICE = TableName.AgentVaultService;
const INLINE_ONLY_CHECK = "agent_vault_services_inline_only_check";

// NOT VALID then VALIDATE, so the full-table check runs without holding the ACCESS EXCLUSIVE lock the ADD takes.
const addInlineOnlyCheck = async (knex: Knex, condition: string) => {
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (${condition}) NOT VALID`, [SERVICE, INLINE_ONLY_CHECK]);
  await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [SERVICE, INLINE_ONLY_CHECK]);
};

// An inline MCP server can now be limited to some of its tools, so the check keeps only member fields and OAuth off
// inline services.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SERVICE, INLINE_ONLY_CHECK]);
  await addInlineOnlyCheck(
    knex,
    `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth')`
  );
}

// Code without inline tool lists sends every inline MCP server with all of its tools, so clearing them loses nothing.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SERVICE, INLINE_ONLY_CHECK]);
  await knex(SERVICE).whereNotNull("sessionId").whereNotNull("allowedTools").update({ allowedTools: null });
  await addInlineOnlyCheck(
    knex,
    `"sessionId" IS NULL OR ("memberProvidedFields" IS NULL AND "credentialType" <> 'oauth' AND "allowedTools" IS NULL)`
  );
}
