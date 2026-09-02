import { Knex } from "knex";

import { TableName } from "../schemas";

// the ldap templateId FK shipped without an index; template update/delete fan-outs and the
// FK's RI trigger both filter identity_ldap_auths by it. Separate from the kubernetes
// template migration so rolling that feature back cannot drop an index LDAP depends on.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS "identity_ldap_auths_templateid_index" ON ${TableName.IdentityLdapAuth} ("templateId")`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "identity_ldap_auths_templateid_index"`);
}
