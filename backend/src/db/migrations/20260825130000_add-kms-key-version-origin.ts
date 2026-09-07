import { Knex } from "knex";

import { TableName } from "../schemas";

const INTERNAL_KMS_KEY_VERSION_ORIGIN_CONSTRAINT = "internal_kms_key_version_origin_check";
const INTERNAL_KMS_ORIGIN_CONSTRAINT = "internal_kms_origin_check";

export async function up(knex: Knex): Promise<void> {
  const hasInternalKms = await knex.schema.hasTable(TableName.InternalKms);
  const hasInternalKmsOrigin = hasInternalKms && (await knex.schema.hasColumn(TableName.InternalKms, "origin"));
  if (hasInternalKms && !hasInternalKmsOrigin) {
    await knex.schema.alterTable(TableName.InternalKms, (t) => {
      t.string("origin").notNullable().defaultTo("internal");
    });
  }

  if (hasInternalKms && (await knex.schema.hasColumn(TableName.InternalKms, "origin"))) {
    await knex.raw(
      `ALTER TABLE "${TableName.InternalKms}" DROP CONSTRAINT IF EXISTS "${INTERNAL_KMS_ORIGIN_CONSTRAINT}"`
    );
    await knex.raw(`
      ALTER TABLE "${TableName.InternalKms}"
      ADD CONSTRAINT "${INTERNAL_KMS_ORIGIN_CONSTRAINT}"
      CHECK ("origin" IN ('internal', 'imported'))
    `);
  }

  const hasInternalKmsKeyVersions = await knex.schema.hasTable(TableName.InternalKmsKeyVersion);
  const hasOrigin =
    hasInternalKmsKeyVersions && (await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "origin"));
  if (hasInternalKmsKeyVersions && !hasOrigin) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (t) => {
      t.string("origin").notNullable().defaultTo("internal");
    });
  }

  if (hasInternalKmsKeyVersions && (await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "origin"))) {
    await knex.raw(
      `ALTER TABLE "${TableName.InternalKmsKeyVersion}" DROP CONSTRAINT IF EXISTS "${INTERNAL_KMS_KEY_VERSION_ORIGIN_CONSTRAINT}"`
    );
    await knex.raw(`
      ALTER TABLE "${TableName.InternalKmsKeyVersion}"
      ADD CONSTRAINT "${INTERNAL_KMS_KEY_VERSION_ORIGIN_CONSTRAINT}"
      CHECK ("origin" IN ('internal', 'imported'))
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasInternalKms = await knex.schema.hasTable(TableName.InternalKms);
  const hasInternalKmsOrigin = hasInternalKms && (await knex.schema.hasColumn(TableName.InternalKms, "origin"));
  if (hasInternalKmsOrigin) {
    await knex.raw(
      `ALTER TABLE "${TableName.InternalKms}" DROP CONSTRAINT IF EXISTS "${INTERNAL_KMS_ORIGIN_CONSTRAINT}"`
    );
    await knex.schema.alterTable(TableName.InternalKms, (t) => {
      t.dropColumn("origin");
    });
  }

  const hasInternalKmsKeyVersions = await knex.schema.hasTable(TableName.InternalKmsKeyVersion);
  const hasOrigin =
    hasInternalKmsKeyVersions && (await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "origin"));
  if (hasOrigin) {
    await knex.raw(`
      ALTER TABLE "${TableName.InternalKmsKeyVersion}"
      DROP CONSTRAINT IF EXISTS "${INTERNAL_KMS_KEY_VERSION_ORIGIN_CONSTRAINT}"
    `);

    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (t) => {
      t.dropColumn("origin");
    });
  }
}
