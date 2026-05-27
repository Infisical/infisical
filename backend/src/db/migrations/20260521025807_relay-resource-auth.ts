import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // 1. Add relayId FK to resource_auth_methods — same nullable-FK-per-resource-type
  // pattern used for gatewayId (see 20260430143000_resource-auth-methods.ts).
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasRelayId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "relayId");
    if (!hasRelayId) {
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.uuid("relayId").nullable();
        t.foreign("relayId").references("id").inTable(TableName.Relay).onDelete("CASCADE");
      });

      await knex.schema.raw(`
        CREATE UNIQUE INDEX one_method_per_relay
        ON ${TableName.ResourceAuthMethod} ("relayId")
        WHERE "relayId" IS NOT NULL
      `);
    }
  }

  // 2. Add tokenVersion to relays — used for stateless JWT revocation,
  // same pattern as gateways_v2.tokenVersion.
  if (await knex.schema.hasTable(TableName.Relay)) {
    const hasTokenVersion = await knex.schema.hasColumn(TableName.Relay, "tokenVersion");
    if (!hasTokenVersion) {
      await knex.schema.alterTable(TableName.Relay, (t) => {
        t.integer("tokenVersion").notNullable().defaultTo(0);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Relay)) {
    const hasTokenVersion = await knex.schema.hasColumn(TableName.Relay, "tokenVersion");
    if (hasTokenVersion) {
      await knex.schema.alterTable(TableName.Relay, (t) => {
        t.dropColumn("tokenVersion");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasRelayId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "relayId");
    if (hasRelayId) {
      await knex.schema.raw(`DROP INDEX IF EXISTS one_method_per_relay`);
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.dropColumn("relayId");
      });
    }
  }
}
