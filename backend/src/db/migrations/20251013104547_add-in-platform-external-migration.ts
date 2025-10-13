import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ExternalMigrationConfig))) {
    await knex.schema.createTable(TableName.ExternalMigrationConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("platform").notNullable();

      t.uuid("connectionId");
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);

      t.timestamps(true, true, true);
      t.unique(["orgId", "platform"]);
    });

    await createOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ExternalMigrationConfig);
  await dropOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);
}
