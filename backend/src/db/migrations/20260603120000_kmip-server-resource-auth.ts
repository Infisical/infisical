import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // 1. kmip_servers — first-class org resource representing an enrolled KMIP server,
  // mirroring the relays table. Unlike gateways/relays there is no identityId column:
  // KMIP servers are always created via enrollment (token/AWS), never machine-identity.
  // The legacy machine-identity registration path does not create rows here.
  if (!(await knex.schema.hasTable(TableName.KmipServer))) {
    await knex.schema.createTable(TableName.KmipServer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("name").notNullable();
      t.integer("tokenVersion").notNullable().defaultTo(0);

      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.KmipServer);
  }

  // 2. Add kmipServerId FK to resource_auth_methods — same nullable-FK-per-resource-type
  // pattern used for gatewayId/relayId (see 20260430143000_resource-auth-methods.ts).
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasKmipServerId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "kmipServerId");
    if (!hasKmipServerId) {
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.uuid("kmipServerId").nullable();
        t.foreign("kmipServerId").references("id").inTable(TableName.KmipServer).onDelete("CASCADE");
      });

      await knex.schema.raw(`
        CREATE UNIQUE INDEX one_method_per_kmip_server
        ON ${TableName.ResourceAuthMethod} ("kmipServerId")
        WHERE "kmipServerId" IS NOT NULL
      `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasKmipServerId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "kmipServerId");
    if (hasKmipServerId) {
      await knex.schema.raw(`DROP INDEX IF EXISTS one_method_per_kmip_server`);
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.dropColumn("kmipServerId");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.KmipServer);
  await knex.schema.dropTableIfExists(TableName.KmipServer);
}
