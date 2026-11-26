import { Knex } from "knex";

import { TableName } from "../schemas";

type TServiceTable = {
  table: TableName;
  typeCheck: string;
  credentialTypeCheck: string;
  clientCertificateCheck: string;
  credentialTypesBefore: string[];
};

const SERVICES: TServiceTable = {
  table: TableName.AgentVaultService,
  typeCheck: "agent_vault_services_type_check",
  credentialTypeCheck: "agent_vault_services_credential_type_check",
  clientCertificateCheck: "agent_vault_services_client_certificate_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough", "oauth", "ssh-key"]
};

const INLINE_SERVICES: TServiceTable = {
  table: TableName.AgentVaultSessionInlineService,
  typeCheck: "agent_vault_session_inline_services_type_check",
  credentialTypeCheck: "agent_vault_session_inline_services_credential_type_check",
  clientCertificateCheck: "agent_vault_session_inline_services_client_certificate_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough", "ssh-key"]
};

const TYPES_BEFORE = ["http", "mcp", "postgres", "mysql", "ssh"];

const inList = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const addTlsServices = async (
  knex: Knex,
  { table, typeCheck, credentialTypeCheck, clientCertificateCheck, credentialTypesBefore }: TServiceTable
) => {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN (${inList([...TYPES_BEFORE, "tls"])}))`, [
    table,
    typeCheck
  ]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, credentialTypeCheck]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN (${inList([...credentialTypesBefore, "client-certificate"])}))`,
    [table, credentialTypeCheck]
  );

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, clientCertificateCheck]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("credentialType" = 'client-certificate') = ("type" = 'tls'))`,
    [table, clientCertificateCheck]
  );
};

// Restoring the old checks fails while a TLS service exists, so rolling back requires deleting those first.
const removeTlsServices = async (
  knex: Knex,
  { table, typeCheck, credentialTypeCheck, clientCertificateCheck, credentialTypesBefore }: TServiceTable
) => {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, clientCertificateCheck]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, credentialTypeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN (${inList(credentialTypesBefore)}))`, [
    table,
    credentialTypeCheck
  ]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, typeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("type" IN (${inList(TYPES_BEFORE)}))`, [table, typeCheck]);
};

export async function up(knex: Knex): Promise<void> {
  await addTlsServices(knex, SERVICES);
  await addTlsServices(knex, INLINE_SERVICES);
}

export async function down(knex: Knex): Promise<void> {
  await removeTlsServices(knex, INLINE_SERVICES);
  await removeTlsServices(knex, SERVICES);
}
