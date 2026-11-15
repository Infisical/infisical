import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const TYPE_CHECK = "agent_vault_session_inline_services_type_check";
const CREDENTIAL_TYPE_CHECK = "agent_vault_session_inline_services_credential_type_check";
const WITH_SECRETS_INDEX = "agent_vault_session_inline_services_with_secrets";

export async function up(knex: Knex): Promise<void> {
  // Services an Agent Vault admin sends with a session instead of adding them to an access bundle. They belong to that
  // one session and are never edited. The rows stay once the session ends, so its history still shows what it could
  // reach, but their secrets don't.
  if (!(await knex.schema.hasTable(TableName.AgentVaultSessionInlineService))) {
    await knex.schema.createTable(TableName.AgentVaultSessionInlineService, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");

      t.integer("position").notNullable();

      // NULL when the request left it out.
      t.string("name", 64);

      t.string("type", 32).notNullable();
      t.jsonb("config");
      t.string("hostPattern", 1024).notNullable();
      t.specificType("allowedMethods", "text[]");
      t.specificType("allowedPathPrefixes", "text[]");

      t.string("credentialType", 32).notNullable();
      t.jsonb("credentialConfig").notNullable();

      // Header names and substitution placeholders only. Their values are sealed in encryptedSecrets.
      t.jsonb("customHeaders").notNullable();
      t.jsonb("substitutions").notNullable();

      // The credential, custom header values and substitution values sealed together, so deleting them once the session
      // ends is one write. NULL after that, and for a pass-through service with nothing to seal.
      t.binary("encryptedSecrets");

      t.timestamps(true, true, true);

      // sessionId leads, so the index also serves the session foreign key's cascade.
      t.unique(["sessionId", "position"], { indexName: "agent_vault_session_inline_services_session_position" });
    });

    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN ('http', 'mcp'))`, [
      TableName.AgentVaultSessionInlineService,
      TYPE_CHECK
    ]);
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN ('bearer', 'basic', 'passthrough'))`, [
      TableName.AgentVaultSessionInlineService,
      CREDENTIAL_TYPE_CHECK
    ]);
    // The hourly cleanup looks only at rows that still hold secrets, so it never scans the history of ended sessions.
    await knex.raw(`CREATE INDEX ?? ON ?? ("sessionId") WHERE "encryptedSecrets" IS NOT NULL`, [
      WITH_SECRETS_INDEX,
      TableName.AgentVaultSessionInlineService
    ]);

    await createOnUpdateTrigger(knex, TableName.AgentVaultSessionInlineService);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultSessionInlineService]);
  await knex.schema.dropTableIfExists(TableName.AgentVaultSessionInlineService);
  await dropOnUpdateTrigger(knex, TableName.AgentVaultSessionInlineService);
}
