import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.DeprecatedSecretScanningConfig);
  if (hasTable) {
    await dropOnUpdateTrigger(knex, TableName.DeprecatedSecretScanningConfig);
    await knex.schema.dropTable(TableName.DeprecatedSecretScanningConfig);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.DeprecatedSecretScanningConfig);
  if (!hasTable) {
    await knex.schema.createTable(TableName.DeprecatedSecretScanningConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable().unique();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("content", 5000);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.DeprecatedSecretScanningConfig);
  }
}
