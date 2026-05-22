import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasClientCertColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapClientCertificate");
  const hasClientKeyColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapClientKeyCertificate");

  if (!hasClientCertColumn || !hasClientKeyColumn) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      if (!hasClientCertColumn) t.binary("encryptedLdapClientCertificate").nullable();
      if (!hasClientKeyColumn) t.binary("encryptedLdapClientKeyCertificate").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasClientCertColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapClientCertificate");
  const hasClientKeyColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapClientKeyCertificate");

  if (hasClientCertColumn || hasClientKeyColumn) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      if (hasClientCertColumn) t.dropColumn("encryptedLdapClientCertificate");
      if (hasClientKeyColumn) t.dropColumn("encryptedLdapClientKeyCertificate");
    });
  }
}
