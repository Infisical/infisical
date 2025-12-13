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

  const hasVersionIndex = await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "internalKmsId");
  if (hasVersionIndex) {
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS internal_kms_key_version_internal_kms_id_version_idx ON ?? ("internalKmsId", "version")`,
      [TableName.InternalKmsKeyVersion]
    );
  }

  const existingInternalKms = await knex(TableName.InternalKms).select("id", "encryptedKey", "version");

  for (const internalKms of existingInternalKms) {
    const existingVersion = await knex(TableName.InternalKmsKeyVersion)
      .where({ internalKmsId: internalKms.id, version: internalKms.version })
      .first();

    if (!existingVersion) {
      await knex(TableName.InternalKmsKeyVersion).insert({
        encryptedKey: internalKms.encryptedKey,
        version: internalKms.version,
        internalKmsId: internalKms.id
      });
    }
  }
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
