import { Knex } from "knex";

import { TableName } from "../schemas";

type TServiceTable = {
  table: TableName;
  typeCheck: string;
  credentialTypeCheck: string;
  hostPatternCheck: string;
  sshKeyCheck: string;
  credentialTypesBefore: string[];
};

const SERVICES: TServiceTable = {
  table: TableName.AgentVaultService,
  typeCheck: "agent_vault_services_type_check",
  credentialTypeCheck: "agent_vault_services_credential_type_check",
  hostPatternCheck: "agent_vault_services_host_pattern_check",
  sshKeyCheck: "agent_vault_services_ssh_key_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough", "oauth"]
};

const INLINE_SERVICES: TServiceTable = {
  table: TableName.AgentVaultSessionInlineService,
  typeCheck: "agent_vault_session_inline_services_type_check",
  credentialTypeCheck: "agent_vault_session_inline_services_credential_type_check",
  hostPatternCheck: "agent_vault_session_inline_services_host_pattern_check",
  sshKeyCheck: "agent_vault_session_inline_services_ssh_key_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough"]
};

const inList = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const addNativeServices = async (
  knex: Knex,
  { table, typeCheck, credentialTypeCheck, hostPatternCheck, sshKeyCheck, credentialTypesBefore }: TServiceTable
) => {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN ('http', 'mcp', 'postgres', 'mysql', 'ssh'))`, [
    table,
    typeCheck
  ]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, credentialTypeCheck]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN (${inList([...credentialTypesBefore, "ssh-key"])}))`,
    [table, credentialTypeCheck]
  );

  // Database and SSH services keep their host in config. A host pattern on one would let HTTP matching, which has no
  // type filter, attach its password to any request to that host, so the pattern is NULL exactly for those types.
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, hostPatternCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("type" IN ('http', 'mcp')) = ("hostPattern" IS NOT NULL))`, [
    table,
    hostPatternCheck
  ]);
  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "hostPattern" DROP NOT NULL`, [table]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, sshKeyCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" <> 'ssh-key' OR "type" = 'ssh')`, [
    table,
    sshKeyCheck
  ]);
};

// Restoring the old checks fails while a database or SSH service exists, so rolling back requires deleting those first.
const removeNativeServices = async (
  knex: Knex,
  { table, typeCheck, credentialTypeCheck, hostPatternCheck, sshKeyCheck, credentialTypesBefore }: TServiceTable
) => {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, sshKeyCheck]);
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, hostPatternCheck]);
  await knex.raw(`ALTER TABLE ?? ALTER COLUMN "hostPattern" SET NOT NULL`, [table]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, credentialTypeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN (${inList(credentialTypesBefore)}))`, [
    table,
    credentialTypeCheck
  ]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN ('http', 'mcp'))`, [table, typeCheck]);
};

export async function up(knex: Knex): Promise<void> {
  await addNativeServices(knex, SERVICES);
  await addNativeServices(knex, INLINE_SERVICES);
}

export async function down(knex: Knex): Promise<void> {
  await removeNativeServices(knex, INLINE_SERVICES);
  await removeNativeServices(knex, SERVICES);
}
