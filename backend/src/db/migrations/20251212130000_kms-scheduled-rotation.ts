import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasRotationIntervalColumn = await knex.schema.hasColumn(TableName.InternalKms, "rotationInterval");
  if (!hasRotationIntervalColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.integer("rotationInterval").nullable();

      tb.timestamp("nextRotationAt").nullable();

      tb.boolean("isAutoRotationEnabled").defaultTo(false).notNullable();
    });
  }

  await knex.raw(`CREATE INDEX IF NOT EXISTS internal_kms_next_rotation_at_idx ON ?? ("nextRotationAt")`, [
    TableName.InternalKms
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS internal_kms_next_rotation_at_idx`);

  const hasRotationIntervalColumn = await knex.schema.hasColumn(TableName.InternalKms, "rotationInterval");
  if (hasRotationIntervalColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.dropColumn("rotationInterval");
      tb.dropColumn("nextRotationAt");
      tb.dropColumn("isAutoRotationEnabled");
    });
  }
}
