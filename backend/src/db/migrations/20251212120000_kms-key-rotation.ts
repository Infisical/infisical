import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasRotatedAtColumn = await knex.schema.hasColumn(TableName.InternalKms, "rotatedAt");
  if (!hasRotatedAtColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.timestamp("rotatedAt").nullable();
    });
  }

  const hasCreatedAtColumn = await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "createdAt");
  if (!hasCreatedAtColumn) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (tb) => {
      tb.timestamp("createdAt").defaultTo(knex.fn.now()).notNullable();
    });
  }

  // Check if index exists before creating (use UNIQUE to prevent duplicate versions)
  const indexExists = await knex.raw(`
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'internal_kms_key_version_internal_kms_id_version_idx'
  `);

  await knex.transaction(async (trx) => {
    if (indexExists.rows.length === 0) {
      await trx.raw(
        `CREATE UNIQUE INDEX internal_kms_key_version_internal_kms_id_version_idx ON ?? ("internalKmsId", "version")`,
        [TableName.InternalKmsKeyVersion]
      );
    }

    // Bulk insert existing key versions for backfill (skip if already exists)
    await trx.raw(
      `
      INSERT INTO ?? ("encryptedKey", "version", "internalKmsId")
      SELECT ik."encryptedKey", ik."version", ik."id"
      FROM ?? ik
      WHERE NOT EXISTS (
        SELECT 1 FROM ?? ikv
        WHERE ikv."internalKmsId" = ik."id"
        AND ikv."version" = ik."version"
      )
      `,
      [TableName.InternalKmsKeyVersion, TableName.InternalKms, TableName.InternalKmsKeyVersion]
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasRotatedAtColumn = await knex.schema.hasColumn(TableName.InternalKms, "rotatedAt");
  if (hasRotatedAtColumn) {
    await knex.schema.alterTable(TableName.InternalKms, (tb) => {
      tb.dropColumn("rotatedAt");
    });
  }

  const hasCreatedAtColumn = await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "createdAt");
  if (hasCreatedAtColumn) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (tb) => {
      tb.dropColumn("createdAt");
    });
  }

  await knex.raw(`DROP INDEX IF EXISTS internal_kms_key_version_internal_kms_id_version_idx`);
}
