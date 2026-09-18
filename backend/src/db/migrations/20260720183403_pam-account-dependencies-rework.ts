import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// Reworks the orphaned pre-revamp pam_account_dependencies table onto the revamp account model: each dependency
// is anchored to its run-as identity (fingerprint) and points at the staged discovered or imported account.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.PamAccountDependency);

  await knex.schema.createTable(TableName.PamAccountDependency, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

    // Tenant scope (the per-org internal PAM project, same as every other PAM table). Part of the upsert key so
    // two orgs scanning the same host/directory can't collide on one global row.
    t.string("projectId").notNullable();
    t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    t.index("projectId");

    // Run-as stable identity (domain:objectGUID / SID); the upsert key, stable across the
    // staged -> imported flip.
    t.string("fingerprint").notNullable();

    t.uuid("accountId");
    t.foreign("accountId").references("id").inTable(TableName.PamAccount).onDelete("CASCADE");
    t.index("accountId");

    t.uuid("discoveredAccountId");
    t.foreign("discoveredAccountId").references("id").inTable(TableName.PamDiscoveredAccount).onDelete("CASCADE");
    t.index("discoveredAccountId");

    t.string("type").notNullable(); // windows-service / scheduled-task / iis-app-pool
    t.string("name").notNullable();
    t.string("machine").notNullable();
    t.jsonb("data").notNullable(); // type-specific detail (run-as, path, triggers, etc.)

    t.string("rotationStatus").nullable(); // pending / success / failed (set by rotation sync)
    t.timestamp("lastRotatedAt").nullable();
    t.binary("encryptedLastRotationMessage").nullable();

    t.timestamps(true, true, true);

    t.unique(["projectId", "fingerprint", "machine", "type", "name"]);
  });

  // Exactly one of accountId / discoveredAccountId is set: staged -> discoveredAccountId, imported -> accountId.
  await knex.raw(
    `ALTER TABLE "${TableName.PamAccountDependency}" ADD CONSTRAINT "pam_account_dependencies_account_xor_discovered" CHECK (("accountId" IS NULL) <> ("discoveredAccountId" IS NULL))`
  );

  await createOnUpdateTrigger(knex, TableName.PamAccountDependency);

  // Dependency counts on the existing runs table, nullable so a scan that ran no dependency discovery leaves
  // them null and the summary omits the dependencies clause.
  if (!(await knex.schema.hasColumn(TableName.PamDiscoverySourceRun, "dependencyCount"))) {
    await knex.schema.alterTable(TableName.PamDiscoverySourceRun, (t) => {
      t.integer("dependencyCount");
      t.integer("newDependencyCount");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamDiscoverySourceRun, "dependencyCount")) {
    await knex.schema.alterTable(TableName.PamDiscoverySourceRun, (t) => {
      t.dropColumn("dependencyCount");
      t.dropColumn("newDependencyCount");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.PamAccountDependency);
  await knex.schema.dropTableIfExists(TableName.PamAccountDependency);

  // Restore the legacy (orphaned) shape so a rollback lands on the prior schema.
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
    t.boolean("isRotationSyncEnabled").defaultTo(false);

    t.string("syncStatus").nullable();
    t.timestamp("lastSyncedAt").nullable();
    t.binary("encryptedLastSyncMessage").nullable();

    t.unique(["accountId", "resourceId", "dependencyType", "name"], {
      indexName: "uidx_pam_account_dependency"
    });

    t.timestamps(true, true, true);
  });
}
