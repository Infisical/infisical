import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InstanceProxyConfig))) {
    await knex.schema.createTable(TableName.InstanceProxyConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      // Root CA for proxy PKI
      t.binary("encryptedRootProxyPkiCaPrivateKey").notNullable();
      t.binary("encryptedRootProxyPkiCaCertificate").notNullable();

      // Instance CA for proxy PKI
      t.binary("encryptedInstanceProxyPkiCaPrivateKey").notNullable();
      t.binary("encryptedInstanceProxyPkiCaCertificate").notNullable();
      t.binary("encryptedInstanceProxyPkiCaCertificateChain").notNullable();

      // Instance client/server intermediates for proxy PKI
      t.binary("encryptedInstanceProxyPkiClientCaPrivateKey").notNullable();
      t.binary("encryptedInstanceProxyPkiClientCaCertificate").notNullable();
      t.binary("encryptedInstanceProxyPkiClientCaCertificateChain").notNullable();
      t.binary("encryptedInstanceProxyPkiServerCaPrivateKey").notNullable();
      t.binary("encryptedInstanceProxyPkiServerCaCertificate").notNullable();
      t.binary("encryptedInstanceProxyPkiServerCaCertificateChain").notNullable();

      // Org Parent CAs for proxy
      t.binary("encryptedOrgProxyPkiCaPrivateKey").notNullable();
      t.binary("encryptedOrgProxyPkiCaCertificate").notNullable();
      t.binary("encryptedOrgProxyPkiCaCertificateChain").notNullable();

      // Instance SSH CAs for proxy
      t.binary("encryptedInstanceProxySshClientCaPrivateKey").notNullable();
      t.binary("encryptedInstanceProxySshClientCaPublicKey").notNullable();
      t.binary("encryptedInstanceProxySshServerCaPrivateKey").notNullable();
      t.binary("encryptedInstanceProxySshServerCaPublicKey").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.InstanceProxyConfig);
  }

  // Org-level proxy configuration (one-to-one with organization)
  if (!(await knex.schema.hasTable(TableName.OrgProxyConfig))) {
    await knex.schema.createTable(TableName.OrgProxyConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      // Org-scoped proxy PKI (client + server)
      t.binary("encryptedProxyPkiClientCaPrivateKey").notNullable();
      t.binary("encryptedProxyPkiClientCaCertificate").notNullable();
      t.binary("encryptedProxyPkiClientCaCertificateChain").notNullable();
      t.binary("encryptedProxyPkiServerCaPrivateKey").notNullable();
      t.binary("encryptedProxyPkiServerCaCertificate").notNullable();
      t.binary("encryptedProxyPkiServerCaCertificateChain").notNullable();

      // Org-scoped proxy SSH (client + server)
      t.binary("encryptedProxySshClientCaPrivateKey").notNullable();
      t.binary("encryptedProxySshClientCaPublicKey").notNullable();
      t.binary("encryptedProxySshServerCaPrivateKey").notNullable();
      t.binary("encryptedProxySshServerCaPublicKey").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.OrgProxyConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.OrgProxyConfig);
  await knex.schema.dropTableIfExists(TableName.OrgProxyConfig);

  await dropOnUpdateTrigger(knex, TableName.InstanceProxyConfig);
  await knex.schema.dropTableIfExists(TableName.InstanceProxyConfig);
}
