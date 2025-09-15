import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InstanceRelayConfig))) {
    await knex.schema.createTable(TableName.InstanceRelayConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      // Root CA for relay PKI
      t.binary("encryptedRootRelayPkiCaPrivateKey").notNullable();
      t.binary("encryptedRootRelayPkiCaCertificate").notNullable();

      // Instance CA for relay PKI
      t.binary("encryptedInstanceRelayPkiCaPrivateKey").notNullable();
      t.binary("encryptedInstanceRelayPkiCaCertificate").notNullable();
      t.binary("encryptedInstanceRelayPkiCaCertificateChain").notNullable();

      // Instance client/server intermediates for relay PKI
      t.binary("encryptedInstanceRelayPkiClientCaPrivateKey").notNullable();
      t.binary("encryptedInstanceRelayPkiClientCaCertificate").notNullable();
      t.binary("encryptedInstanceRelayPkiClientCaCertificateChain").notNullable();
      t.binary("encryptedInstanceRelayPkiServerCaPrivateKey").notNullable();
      t.binary("encryptedInstanceRelayPkiServerCaCertificate").notNullable();
      t.binary("encryptedInstanceRelayPkiServerCaCertificateChain").notNullable();

      // Org Parent CAs for relay
      t.binary("encryptedOrgRelayPkiCaPrivateKey").notNullable();
      t.binary("encryptedOrgRelayPkiCaCertificate").notNullable();
      t.binary("encryptedOrgRelayPkiCaCertificateChain").notNullable();

      // Instance SSH CAs for relay
      t.binary("encryptedInstanceRelaySshClientCaPrivateKey").notNullable();
      t.binary("encryptedInstanceRelaySshClientCaPublicKey").notNullable();
      t.binary("encryptedInstanceRelaySshServerCaPrivateKey").notNullable();
      t.binary("encryptedInstanceRelaySshServerCaPublicKey").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.InstanceRelayConfig);
  }

  // Org-level relay configuration (one-to-one with organization)
  if (!(await knex.schema.hasTable(TableName.OrgRelayConfig))) {
    await knex.schema.createTable(TableName.OrgRelayConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      // Org-scoped relay PKI (client + server)
      t.binary("encryptedRelayPkiClientCaPrivateKey").notNullable();
      t.binary("encryptedRelayPkiClientCaCertificate").notNullable();
      t.binary("encryptedRelayPkiClientCaCertificateChain").notNullable();
      t.binary("encryptedRelayPkiServerCaPrivateKey").notNullable();
      t.binary("encryptedRelayPkiServerCaCertificate").notNullable();
      t.binary("encryptedRelayPkiServerCaCertificateChain").notNullable();

      // Org-scoped relay SSH (client + server)
      t.binary("encryptedRelaySshClientCaPrivateKey").notNullable();
      t.binary("encryptedRelaySshClientCaPublicKey").notNullable();
      t.binary("encryptedRelaySshServerCaPrivateKey").notNullable();
      t.binary("encryptedRelaySshServerCaPublicKey").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.OrgRelayConfig);
  }

  if (!(await knex.schema.hasTable(TableName.OrgGatewayConfigV2))) {
    await knex.schema.createTable(TableName.OrgGatewayConfigV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.binary("encryptedRootGatewayCaPrivateKey").notNullable();
      t.binary("encryptedRootGatewayCaCertificate").notNullable();
      t.binary("encryptedGatewayServerCaPrivateKey").notNullable();
      t.binary("encryptedGatewayServerCaCertificate").notNullable();
      t.binary("encryptedGatewayServerCaCertificateChain").notNullable();
      t.binary("encryptedGatewayClientCaPrivateKey").notNullable();
      t.binary("encryptedGatewayClientCaCertificate").notNullable();
      t.binary("encryptedGatewayClientCaCertificateChain").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.OrgGatewayConfigV2);
  }

  if (!(await knex.schema.hasTable(TableName.Relay))) {
    await knex.schema.createTable(TableName.Relay, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.string("name").notNullable();
      t.string("host").notNullable();

      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.Relay);
  }

  if (!(await knex.schema.hasTable(TableName.GatewayV2))) {
    await knex.schema.createTable(TableName.GatewayV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.uuid("relayId");
      t.foreign("relayId").references("id").inTable(TableName.Relay).onDelete("SET NULL");

      t.string("name").notNullable();

      t.unique(["orgId", "name"]);

      t.dateTime("heartbeat");
    });

    await createOnUpdateTrigger(knex, TableName.GatewayV2);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.OrgRelayConfig);
  await knex.schema.dropTableIfExists(TableName.OrgRelayConfig);

  await dropOnUpdateTrigger(knex, TableName.InstanceRelayConfig);
  await knex.schema.dropTableIfExists(TableName.InstanceRelayConfig);

  await dropOnUpdateTrigger(knex, TableName.OrgGatewayConfigV2);
  await knex.schema.dropTableIfExists(TableName.OrgGatewayConfigV2);

  await dropOnUpdateTrigger(knex, TableName.GatewayV2);
  await knex.schema.dropTableIfExists(TableName.GatewayV2);

  await dropOnUpdateTrigger(knex, TableName.Relay);
  await knex.schema.dropTableIfExists(TableName.Relay);
}
