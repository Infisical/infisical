import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasKmipClientTable = await knex.schema.hasTable(TableName.KmipClient);
  if (!hasKmipClientTable) {
    await knex.schema.createTable(TableName.KmipClient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.specificType("permissions", "text[]");
      t.string("description");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }

  const hasKmipOrgPkiConfig = await knex.schema.hasTable(TableName.KmipOrgConfig);
  if (!hasKmipOrgPkiConfig) {
    await knex.schema.createTable(TableName.KmipOrgConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.unique("orgId");

      t.string("caKeyAlgorithm").notNullable();

      t.datetime("rootCaIssuedAt").notNullable();
      t.datetime("rootCaExpiration").notNullable();
      t.string("rootCaSerialNumber").notNullable();
      t.binary("encryptedRootCaCertificate").notNullable();
      t.binary("encryptedRootCaPrivateKey").notNullable();

      t.datetime("serverIntermediateCaIssuedAt").notNullable();
      t.datetime("serverIntermediateCaExpiration").notNullable();
      t.string("serverIntermediateCaSerialNumber");
      t.binary("encryptedServerIntermediateCaCertificate").notNullable();
      t.binary("encryptedServerIntermediateCaChain").notNullable();
      t.binary("encryptedServerIntermediateCaPrivateKey").notNullable();

      t.datetime("clientIntermediateCaIssuedAt").notNullable();
      t.datetime("clientIntermediateCaExpiration").notNullable();
      t.string("clientIntermediateCaSerialNumber").notNullable();
      t.binary("encryptedClientIntermediateCaCertificate").notNullable();
      t.binary("encryptedClientIntermediateCaChain").notNullable();
      t.binary("encryptedClientIntermediateCaPrivateKey").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.KmipOrgConfig);
  }

  const hasKmipOrgServerCertTable = await knex.schema.hasTable(TableName.KmipOrgServerCertificates);
  if (!hasKmipOrgServerCertTable) {
    await knex.schema.createTable(TableName.KmipOrgServerCertificates, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("commonName").notNullable();
      t.string("altNames").notNullable();
      t.string("serialNumber").notNullable();
      t.string("keyAlgorithm").notNullable();
      t.datetime("issuedAt").notNullable();
      t.datetime("expiration").notNullable();
      t.binary("encryptedCertificate").notNullable();
      t.binary("encryptedChain").notNullable();
    });
  }

  const hasKmipClientCertTable = await knex.schema.hasTable(TableName.KmipClientCertificates);
  if (!hasKmipClientCertTable) {
    await knex.schema.createTable(TableName.KmipClientCertificates, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("kmipClientId").notNullable();
      t.foreign("kmipClientId").references("id").inTable(TableName.KmipClient).onDelete("CASCADE");
      t.string("serialNumber").notNullable();
      t.string("keyAlgorithm").notNullable();
      t.datetime("issuedAt").notNullable();
      t.datetime("expiration").notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKmipOrgPkiConfig = await knex.schema.hasTable(TableName.KmipOrgConfig);
  if (hasKmipOrgPkiConfig) {
    await knex.schema.dropTable(TableName.KmipOrgConfig);
    await dropOnUpdateTrigger(knex, TableName.KmipOrgConfig);
  }

  const hasKmipOrgServerCertTable = await knex.schema.hasTable(TableName.KmipOrgServerCertificates);
  if (hasKmipOrgServerCertTable) {
    await knex.schema.dropTable(TableName.KmipOrgServerCertificates);
  }

  const hasKmipClientCertTable = await knex.schema.hasTable(TableName.KmipClientCertificates);
  if (hasKmipClientCertTable) {
    await knex.schema.dropTable(TableName.KmipClientCertificates);
  }

  const hasKmipClientTable = await knex.schema.hasTable(TableName.KmipClient);
  if (hasKmipClientTable) {
    await knex.schema.dropTable(TableName.KmipClient);
  }
}
