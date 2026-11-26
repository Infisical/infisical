import { Knex } from "knex";

import { TableName } from "../schemas";

type TServiceTable = {
  table: TableName;
  credentialTypeCheck: string;
  clientCertificateCheck: string;
  credentialTypesBefore: string[];
};

const SERVICES: TServiceTable = {
  table: TableName.AgentVaultService,
  credentialTypeCheck: "agent_vault_services_credential_type_check",
  clientCertificateCheck: "agent_vault_services_client_certificate_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough", "oauth", "ssh-key", "client-certificate"]
};

const INLINE_SERVICES: TServiceTable = {
  table: TableName.AgentVaultSessionInlineService,
  credentialTypeCheck: "agent_vault_session_inline_services_credential_type_check",
  clientCertificateCheck: "agent_vault_session_inline_services_client_certificate_check",
  credentialTypesBefore: ["bearer", "basic", "passthrough", "ssh-key", "client-certificate"]
};

const inList = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const setChecks = async (
  knex: Knex,
  { table, credentialTypeCheck, clientCertificateCheck }: TServiceTable,
  credentialTypes: string[],
  tlsCredentialTypes: string[]
) => {
  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, credentialTypeCheck]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("credentialType" IN (${inList(credentialTypes)}))`, [
    table,
    credentialTypeCheck
  ]);

  await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [table, clientCertificateCheck]);
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (("credentialType" IN (${inList(tlsCredentialTypes)})) = ("type" = 'tls'))`,
    [table, clientCertificateCheck]
  );
};

export async function up(knex: Knex): Promise<void> {
  const tlsCredentialTypes = ["client-certificate", "dynamic-secret"];
  await setChecks(knex, SERVICES, [...SERVICES.credentialTypesBefore, "dynamic-secret"], tlsCredentialTypes);
  await setChecks(
    knex,
    INLINE_SERVICES,
    [...INLINE_SERVICES.credentialTypesBefore, "dynamic-secret"],
    tlsCredentialTypes
  );
}

// Restoring the old checks fails while a service uses a dynamic secret, so rolling back requires changing or deleting
// those first.
export async function down(knex: Knex): Promise<void> {
  await setChecks(knex, INLINE_SERVICES, INLINE_SERVICES.credentialTypesBefore, ["client-certificate"]);
  await setChecks(knex, SERVICES, SERVICES.credentialTypesBefore, ["client-certificate"]);
}
