import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.VaultExternalMigrationConfig)) {
    await knex.schema.renameTable(TableName.VaultExternalMigrationConfig, TableName.ExternalMigrationConfig);
  }

  if (await knex.schema.hasTable(TableName.ExternalMigrationConfig)) {
    const hasProviderColumn = await knex.schema.hasColumn(TableName.ExternalMigrationConfig, "provider");
    if (!hasProviderColumn) {
      await knex.schema.alterTable(TableName.ExternalMigrationConfig, (t) => {
        t.string("provider").notNullable().defaultTo("vault");
      });
      await knex(TableName.ExternalMigrationConfig).update({ provider: "vault" });
    }

    const hasNullableNamespace = await knex.schema.hasColumn(TableName.ExternalMigrationConfig, "namespace");
    if (hasNullableNamespace) {
      await knex.schema.alterTable(TableName.ExternalMigrationConfig, (t) => {
        t.string("namespace").nullable().alter();
      });
    }

    // Drop the old trigger (still named after the old table, but now on the renamed table)
    await knex.raw(
      `DROP TRIGGER IF EXISTS "${TableName.VaultExternalMigrationConfig}_updatedAt" ON ${TableName.ExternalMigrationConfig}`
    );
    await createOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ExternalMigrationConfig)) {
    // Remove Doppler rows before re-applying the NOT NULL constraint on namespace
    await knex(TableName.ExternalMigrationConfig).where("provider", "doppler").delete();

    const hasProviderColumn = await knex.schema.hasColumn(TableName.ExternalMigrationConfig, "provider");
    await knex.schema.alterTable(TableName.ExternalMigrationConfig, (t) => {
      if (hasProviderColumn) t.dropColumn("provider");
      t.string("namespace").notNullable().alter();
    });

    await dropOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);
    await knex.schema.renameTable(TableName.ExternalMigrationConfig, TableName.VaultExternalMigrationConfig);
    await createOnUpdateTrigger(knex, TableName.VaultExternalMigrationConfig);
  }
}
