import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // PamDiscoverySource is a reused name. credentialAccountId only exists on the new schema, so its presence means we've already migrated
  const sourcesMigrated =
    (await knex.schema.hasTable(TableName.PamDiscoverySource)) &&
    (await knex.schema.hasColumn(TableName.PamDiscoverySource, "credentialAccountId"));

  if (!sourcesMigrated) {
    await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceDependency);
    await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceAccount);
    await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceResource);
    await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceRun);
    await knex.schema.dropTableIfExists(TableName.PamDiscoverySource);

    await knex.schema.createTable(TableName.PamDiscoverySource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("discoveryType").notNullable();
      t.uuid("gatewayId");
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
      t.uuid("gatewayPoolId");
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");
      t.uuid("credentialAccountId").notNullable();
      t.foreign("credentialAccountId").references("id").inTable(TableName.PamAccount).deferrable("deferred");
      t.jsonb("discoveryConfiguration").notNullable();
      t.string("schedule").notNullable().defaultTo("manual");
      t.timestamp("lastRunAt");
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
      t.index("projectId");
      t.index("gatewayId");
      t.index("gatewayPoolId");
      t.index("credentialAccountId");
    });
    await createOnUpdateTrigger(knex, TableName.PamDiscoverySource);
  }

  if (!(await knex.schema.hasTable(TableName.PamDiscoverySourceRun))) {
    await knex.schema.createTable(TableName.PamDiscoverySourceRun, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.string("status").notNullable();
      t.string("triggeredBy").notNullable();
      t.integer("discoveredCount").notNullable().defaultTo(0);
      t.integer("newCount").notNullable().defaultTo(0);
      t.text("errorMessage");
      t.jsonb("machineErrors");
      t.timestamp("startedAt");
      t.timestamp("completedAt");
      t.timestamps(true, true, true);
      t.index("discoverySourceId");
    });
    await createOnUpdateTrigger(knex, TableName.PamDiscoverySourceRun);
  }

  if (!(await knex.schema.hasTable(TableName.PamDiscoveredAccount))) {
    await knex.schema.createTable(TableName.PamDiscoveredAccount, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.string("accountType").notNullable();
      t.string("name").notNullable();
      t.string("fingerprint").notNullable();
      t.binary("encryptedDetails").notNullable();
      t.uuid("importedAccountId");
      t.foreign("importedAccountId").references("id").inTable(TableName.PamAccount).onDelete("SET NULL");
      t.timestamps(true, true, true);
      t.unique(["discoverySourceId", "fingerprint"]);
      t.index("discoverySourceId");
      t.index("importedAccountId");
    });
    await createOnUpdateTrigger(knex, TableName.PamDiscoveredAccount);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Only drops the tables this migration created, so it's not a 100% restore
  await dropOnUpdateTrigger(knex, TableName.PamDiscoveredAccount);
  await knex.schema.dropTableIfExists(TableName.PamDiscoveredAccount);
  await dropOnUpdateTrigger(knex, TableName.PamDiscoverySourceRun);
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceRun);
  await dropOnUpdateTrigger(knex, TableName.PamDiscoverySource);
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySource);
}
