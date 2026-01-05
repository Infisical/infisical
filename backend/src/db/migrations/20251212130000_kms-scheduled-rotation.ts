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

  // Add rotation status tracking columns
  const hasRotationStatusColumn = await knex.schema.hasColumn(TableName.InternalKms, "lastRotationStatus");
  if (!hasRotationStatusColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      // Track rotation status: 'success', 'failed', 'in_progress'
      tb.string("lastRotationStatus").nullable();
      // Track when last rotation was attempted (even if failed)
      tb.timestamp("lastRotationAttemptedAt").nullable();
      // Store job ID for debugging failed rotations
      tb.string("lastRotationJobId").nullable();
      // Store encrypted error message for failed rotations
      tb.binary("encryptedLastRotationMessage").nullable();
      // Track if last rotation was manual or automatic
      tb.boolean("isLastRotationManual").nullable();
    });
  }

  const nextRotationIndexExists = await knex.raw(`
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'internal_kms_next_rotation_at_idx'
  `);

  if (nextRotationIndexExists.rows.length === 0) {
    await knex.raw(
      `CREATE INDEX internal_kms_next_rotation_at_idx ON ?? ("isAutoRotationEnabled", "nextRotationAt") WHERE "isAutoRotationEnabled" = true`,
      [TableName.InternalKms]
    );
  }
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

  const hasRotationStatusColumn = await knex.schema.hasColumn(TableName.InternalKms, "lastRotationStatus");
  if (hasRotationStatusColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.dropColumn("lastRotationStatus");
      tb.dropColumn("lastRotationAttemptedAt");
      tb.dropColumn("lastRotationJobId");
      tb.dropColumn("encryptedLastRotationMessage");
      tb.dropColumn("isLastRotationManual");
    });
  }
}
