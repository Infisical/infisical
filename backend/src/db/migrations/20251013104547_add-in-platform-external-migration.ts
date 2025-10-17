import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.VaultExternalMigrationConfig))) {
    await knex.schema.createTable(TableName.VaultExternalMigrationConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("namespace").notNullable();

      t.uuid("connectionId");
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);

      t.timestamps(true, true, true);
      t.unique(["orgId", "namespace"]);
    });

    await createOnUpdateTrigger(knex, TableName.VaultExternalMigrationConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.VaultExternalMigrationConfig);
  await dropOnUpdateTrigger(knex, TableName.VaultExternalMigrationConfig);
}
