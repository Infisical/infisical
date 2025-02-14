import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.GatewayInstanceConfig))) {
    await knex.schema.createTable(TableName.GatewayInstanceConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("caKeyAlgorithm").notNullable();
      t.boolean("isDisabled").defaultTo(false);

      t.string("infisicalClientCaSerialNumber").notNullable();
      t.datetime("infisicalClientCaIssuedAt").notNullable();
      t.datetime("infisicalClientCaExpiration").notNullable();
      t.binary("encryptedInfisicalClientCaCertificate").notNullable();
      t.binary("encryptedInfisicalClientCaPrivateKey").notNullable();

      t.string("infisicalClientCertSerialNumber").notNullable();
      t.string("infisicalClientCertKeyAlgorithm").notNullable();
      t.datetime("infisicalClientCertIssuedAt").notNullable();
      t.datetime("infisicalClientCertExpiration").notNullable();
      t.binary("encryptedInfisicalClientCertificate").notNullable();
      t.binary("encryptedInfisicalClientPrivateKey").notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.GatewayInstanceConfig);
  }

  if (!(await knex.schema.hasTable(TableName.OrgGatewayRootCa))) {
    await knex.schema.createTable(TableName.OrgGatewayRootCa, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("caKeyAlgorithm").notNullable();
      t.string("caSerialNumber").notNullable();
      t.datetime("caIssuedAt").notNullable();
      t.datetime("caExpiration").notNullable();
      t.binary("encryptedCaCertificate").notNullable();
      t.binary("encryptedCaPrivateKey").notNullable();

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.OrgGatewayRootCa);
  }

  if (!(await knex.schema.hasTable(TableName.Gateway))) {
    await knex.schema.createTable(TableName.Gateway, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("name").notNullable();
      t.string("serialNumber").notNullable();
      t.string("keyAlgorithm").notNullable();
      t.datetime("issuedAt").notNullable();
      t.datetime("expiration").notNullable();

      t.binary("relayAddress").notNullable();

      t.uuid("orgGatewayRootCaId").notNullable();
      t.foreign("orgGatewayRootCaId").references("id").inTable(TableName.OrgGatewayRootCa).onDelete("CASCADE");

      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.Gateway);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.GatewayInstanceConfig);
  await dropOnUpdateTrigger(knex, TableName.GatewayInstanceConfig);

  await knex.schema.dropTableIfExists(TableName.Gateway);
  await dropOnUpdateTrigger(knex, TableName.Gateway);

  await knex.schema.dropTableIfExists(TableName.OrgGatewayRootCa);
  await dropOnUpdateTrigger(knex, TableName.OrgGatewayRootCa);
}
