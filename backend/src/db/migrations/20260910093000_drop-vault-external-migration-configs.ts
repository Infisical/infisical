import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// Superseded by TableName.ExternalMigrationConfig, which the 20260330172252 migration backfilled from this table.
const VAULT_EXTERNAL_MIGRATION_CONFIGS = "vault_external_migration_configs";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(VAULT_EXTERNAL_MIGRATION_CONFIGS)) {
    await dropOnUpdateTrigger(knex, VAULT_EXTERNAL_MIGRATION_CONFIGS);
    await knex.schema.dropTable(VAULT_EXTERNAL_MIGRATION_CONFIGS);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(VAULT_EXTERNAL_MIGRATION_CONFIGS))) {
    await knex.schema.createTable(VAULT_EXTERNAL_MIGRATION_CONFIGS, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("namespace").notNullable();

      t.uuid("connectionId");
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");

      t.timestamps(true, true, true);
      t.unique(["orgId", "namespace"]);
    });

    await createOnUpdateTrigger(knex, VAULT_EXTERNAL_MIGRATION_CONFIGS);
  }
}
