import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // PAM Discovery Sources
  if (!(await knex.schema.hasTable(TableName.PamDiscoverySource))) {
    await knex.schema.createTable(TableName.PamDiscoverySource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name").notNullable();
      t.unique(["projectId", "name"], { indexName: "uidx_pam_discovery_source_project_name" });

      t.string("discoveryType").notNullable();

      t.uuid("gatewayId").notNullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
      t.index("gatewayId");

      t.binary("encryptedDiscoveryCredentials").notNullable();
      t.jsonb("discoveryConfiguration").notNullable();

      t.string("schedule").notNullable().defaultTo("manual");
      t.datetime("lastRunAt").nullable();

      t.string("status").notNullable().defaultTo("active");

      t.timestamps(true, true, true);
    });
  }

  // PAM Discovery Runs
  if (!(await knex.schema.hasTable(TableName.PamDiscoveryRun))) {
    await knex.schema.createTable(TableName.PamDiscoveryRun, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.index("discoverySourceId");

      t.string("status").notNullable();
      t.string("triggeredBy").notNullable();

      t.integer("resourcesDiscovered").defaultTo(0);
      t.integer("accountsDiscovered").defaultTo(0);
      t.integer("dependenciesDiscovered").defaultTo(0);
      t.integer("newSinceLastRun").defaultTo(0);
      t.integer("staleSinceLastRun").defaultTo(0);

      t.jsonb("progress").notNullable();
      t.text("errorMessage").nullable();

      t.datetime("startedAt").nullable();
      t.datetime("completedAt").nullable();

      t.timestamps(true, true, true);
    });
  }

  // PAM Account Dependencies
  if (!(await knex.schema.hasTable(TableName.PamAccountDependency))) {
    await knex.schema.createTable(TableName.PamAccountDependency, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("accountId").notNullable();
      t.foreign("accountId").references("id").inTable(TableName.PamAccount).onDelete("CASCADE");
      t.index("accountId");

      t.uuid("resourceId").notNullable();
      t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");
      t.index("resourceId");

      t.string("dependencyType").notNullable();
      t.string("name").notNullable();
      t.string("displayName").nullable();

      t.string("state").nullable();
      t.jsonb("data").notNullable();

      t.string("source").notNullable();
      t.boolean("isEnabled").defaultTo(false);

      t.unique(["accountId", "resourceId", "dependencyType", "name"], {
        indexName: "uidx_pam_account_dependency"
      });

      t.timestamps(true, true, true);
    });
  }

  // PAM Discovery Source Resources (junction)
  if (!(await knex.schema.hasTable(TableName.PamDiscoverySourceResource))) {
    await knex.schema.createTable(TableName.PamDiscoverySourceResource, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.index("discoverySourceId");

      t.uuid("resourceId").notNullable();
      t.foreign("resourceId").references("id").inTable(TableName.PamResource).onDelete("CASCADE");
      t.index("resourceId");

      t.datetime("lastDiscoveredAt").notNullable();

      t.uuid("lastDiscoveredRunId").nullable();
      t.foreign("lastDiscoveredRunId").references("id").inTable(TableName.PamDiscoveryRun).onDelete("SET NULL");

      t.boolean("isStale").defaultTo(false);

      t.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());

      t.unique(["discoverySourceId", "resourceId"], {
        indexName: "uidx_pam_discovery_source_resource"
      });
    });
  }

  // PAM Discovery Source Accounts (junction)
  if (!(await knex.schema.hasTable(TableName.PamDiscoverySourceAccount))) {
    await knex.schema.createTable(TableName.PamDiscoverySourceAccount, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.index("discoverySourceId");

      t.uuid("accountId").notNullable();
      t.foreign("accountId").references("id").inTable(TableName.PamAccount).onDelete("CASCADE");
      t.index("accountId");

      t.datetime("lastDiscoveredAt").notNullable();

      t.uuid("lastDiscoveredRunId").nullable();
      t.foreign("lastDiscoveredRunId").references("id").inTable(TableName.PamDiscoveryRun).onDelete("SET NULL");

      t.boolean("isStale").defaultTo(false);

      t.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());

      t.unique(["discoverySourceId", "accountId"], {
        indexName: "uidx_pam_discovery_source_account"
      });
    });
  }

  // PAM Discovery Source Dependencies (junction)
  if (!(await knex.schema.hasTable(TableName.PamDiscoverySourceDependency))) {
    await knex.schema.createTable(TableName.PamDiscoverySourceDependency, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("discoverySourceId").notNullable();
      t.foreign("discoverySourceId").references("id").inTable(TableName.PamDiscoverySource).onDelete("CASCADE");
      t.index("discoverySourceId");

      t.uuid("dependencyId").notNullable();
      t.foreign("dependencyId").references("id").inTable(TableName.PamAccountDependency).onDelete("CASCADE");
      t.index("dependencyId");

      t.datetime("lastSeenAt").notNullable();

      t.uuid("lastSeenRunId").nullable();
      t.foreign("lastSeenRunId").references("id").inTable(TableName.PamDiscoveryRun).onDelete("SET NULL");

      t.boolean("isStale").defaultTo(false);

      t.timestamp("createdAt", { useTz: true }).defaultTo(knex.fn.now());

      t.unique(["discoverySourceId", "dependencyId"], {
        indexName: "uidx_pam_discovery_source_dependency"
      });
    });
  }

  await createOnUpdateTrigger(knex, TableName.PamDiscoverySource);
  await createOnUpdateTrigger(knex, TableName.PamDiscoveryRun);
  await createOnUpdateTrigger(knex, TableName.PamAccountDependency);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceDependency);
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceAccount);
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySourceResource);
  await knex.schema.dropTableIfExists(TableName.PamAccountDependency);
  await knex.schema.dropTableIfExists(TableName.PamDiscoveryRun);
  await knex.schema.dropTableIfExists(TableName.PamDiscoverySource);

  await dropOnUpdateTrigger(knex, TableName.PamAccountDependency);
  await dropOnUpdateTrigger(knex, TableName.PamDiscoveryRun);
  await dropOnUpdateTrigger(knex, TableName.PamDiscoverySource);
}
