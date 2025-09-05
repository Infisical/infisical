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

  if (!(await knex.schema.hasTable(TableName.OrgConnectorConfig))) {
    await knex.schema.createTable(TableName.OrgConnectorConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.binary("encryptedRootConnectorCaPrivateKey").notNullable();
      t.binary("encryptedRootConnectorCaCertificate").notNullable();
      t.binary("encryptedConnectorServerCaPrivateKey").notNullable();
      t.binary("encryptedConnectorServerCaCertificate").notNullable();
      t.binary("encryptedConnectorServerCaCertificateChain").notNullable();
      t.binary("encryptedConnectorClientCaPrivateKey").notNullable();
      t.binary("encryptedConnectorClientCaCertificate").notNullable();
      t.binary("encryptedConnectorClientCaCertificateChain").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.OrgConnectorConfig);
  }

  if (!(await knex.schema.hasTable(TableName.Relay))) {
    await knex.schema.createTable(TableName.Relay, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.string("name").notNullable().unique();
      t.string("ip").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.Relay);
  }

  if (!(await knex.schema.hasTable(TableName.Connector))) {
    await knex.schema.createTable(TableName.Connector, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.uuid("relayId");
      t.foreign("relayId").references("id").inTable(TableName.Relay).onDelete("SET NULL");

      t.string("name").notNullable().unique();

      t.dateTime("heartbeat");
    });

    await createOnUpdateTrigger(knex, TableName.Connector);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.OrgRelayConfig);
  await knex.schema.dropTableIfExists(TableName.OrgRelayConfig);
  await dropOnUpdateTrigger(knex, TableName.InstanceRelayConfig);
  await knex.schema.dropTableIfExists(TableName.InstanceRelayConfig);
  await dropOnUpdateTrigger(knex, TableName.OrgConnectorConfig);
  await knex.schema.dropTableIfExists(TableName.OrgConnectorConfig);
  await dropOnUpdateTrigger(knex, TableName.Connector);
  await knex.schema.dropTableIfExists(TableName.Connector);
  await dropOnUpdateTrigger(knex, TableName.Relay);
  await knex.schema.dropTableIfExists(TableName.Relay);
}
