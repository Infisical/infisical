import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OrgGatewayConfig))) {
    await knex.schema.createTable(TableName.OrgGatewayConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("rootCaKeyAlgorithm").notNullable();

      t.datetime("rootCaIssuedAt").notNullable();
      t.datetime("rootCaExpiration").notNullable();
      t.string("rootCaSerialNumber").notNullable();
      t.binary("encryptedRootCaCertificate").notNullable();
      t.binary("encryptedRootCaPrivateKey").notNullable();

      t.datetime("clientCaIssuedAt").notNullable();
      t.datetime("clientCaExpiration").notNullable();
      t.string("clientCaSerialNumber");
      t.binary("encryptedClientCaCertificate").notNullable();
      t.binary("encryptedClientCaPrivateKey").notNullable();

      t.string("clientCertSerialNumber").notNullable();
      t.string("clientCertKeyAlgorithm").notNullable();
      t.datetime("clientCertIssuedAt").notNullable();
      t.datetime("clientCertExpiration").notNullable();
      t.binary("encryptedClientCertificate").notNullable();
      t.binary("encryptedClientPrivateKey").notNullable();

      t.datetime("gatewayCaIssuedAt").notNullable();
      t.datetime("gatewayCaExpiration").notNullable();
      t.string("gatewayCaSerialNumber").notNullable();
      t.binary("encryptedGatewayCaCertificate").notNullable();
      t.binary("encryptedGatewayCaPrivateKey").notNullable();

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.unique("orgId");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.OrgGatewayConfig);
  }

  if (!(await knex.schema.hasTable(TableName.Gateway))) {
    await knex.schema.createTable(TableName.Gateway, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("name").notNullable();
      t.string("serialNumber").notNullable();
      t.string("keyAlgorithm").notNullable();
      t.datetime("issuedAt").notNullable();
      t.datetime("expiration").notNullable();
      t.datetime("heartbeat");

      t.binary("relayAddress").notNullable();

      t.uuid("orgGatewayRootCaId").notNullable();
      t.foreign("orgGatewayRootCaId").references("id").inTable(TableName.OrgGatewayConfig).onDelete("CASCADE");

      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.Gateway);
  }

  if (!(await knex.schema.hasTable(TableName.ProjectGateway))) {
    await knex.schema.createTable(TableName.ProjectGateway, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("gatewayId").notNullable();
      t.foreign("gatewayId").references("id").inTable(TableName.Gateway).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ProjectGateway);
  }

  if (await knex.schema.hasTable(TableName.DynamicSecret)) {
    const doesGatewayColExist = await knex.schema.hasColumn(TableName.DynamicSecret, "projectGatewayId");
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      // not setting a foreign constraint so that cascade effects are not triggered
      if (!doesGatewayColExist) {
        t.uuid("projectGatewayId");
        t.foreign("projectGatewayId").references("id").inTable(TableName.ProjectGateway);
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.DynamicSecret)) {
    const doesGatewayColExist = await knex.schema.hasColumn(TableName.DynamicSecret, "projectGatewayId");
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (doesGatewayColExist) t.dropColumn("projectGatewayId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.ProjectGateway);
  await dropOnUpdateTrigger(knex, TableName.ProjectGateway);

  await knex.schema.dropTableIfExists(TableName.Gateway);
  await dropOnUpdateTrigger(knex, TableName.Gateway);

  await knex.schema.dropTableIfExists(TableName.OrgGatewayConfig);
  await dropOnUpdateTrigger(knex, TableName.OrgGatewayConfig);
}
