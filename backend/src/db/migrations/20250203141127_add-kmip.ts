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

  const hasKmipInstanceConfigTable = await knex.schema.hasTable(TableName.KmipInstanceConfig);
  if (!hasKmipInstanceConfigTable) {
    await knex.schema.createTable(TableName.KmipInstanceConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

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

    await createOnUpdateTrigger(knex, TableName.KmipInstanceConfig);
  }

  const hasKmipInstanceServerCertTable = await knex.schema.hasTable(TableName.KmipInstanceServerCertificates);
  if (!hasKmipInstanceServerCertTable) {
    await knex.schema.createTable(TableName.KmipInstanceServerCertificates, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
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
}

export async function down(knex: Knex): Promise<void> {
  const hasKmipClientTable = await knex.schema.hasTable(TableName.KmipClient);
  if (hasKmipClientTable) {
    await knex.schema.dropTable(TableName.KmipClient);
  }

  const hasKmipInstanceConfigTable = await knex.schema.hasTable(TableName.KmipInstanceConfig);
  if (hasKmipInstanceConfigTable) {
    await knex.schema.dropTable(TableName.KmipInstanceConfig);
    await dropOnUpdateTrigger(knex, TableName.KmipInstanceConfig);
  }

  const hasKmipInstanceServerCertTable = await knex.schema.hasTable(TableName.KmipInstanceServerCertificates);
  if (hasKmipInstanceServerCertTable) {
    await knex.schema.dropTable(TableName.KmipInstanceServerCertificates);
  }
}
