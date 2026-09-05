import { Knex } from "knex";

import { TableName } from "../schemas";

const KMS_KEY_STATUS_CONSTRAINT = "kms_keys_status_check";

export async function up(knex: Knex): Promise<void> {
  const hasImportable = await knex.schema.hasColumn(TableName.KmsKey, "isImportable");
  if (!hasImportable) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.boolean("isImportable").notNullable().defaultTo(false);
    });
  }

  const hasImportOnly = await knex.schema.hasColumn(TableName.KmsKey, "importOnly");
  if (!hasImportOnly) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.boolean("importOnly").defaultTo(false);
    });
  }

  const hasStatus = await knex.schema.hasColumn(TableName.KmsKey, "status");
  if (!hasStatus) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => {
      t.string("status").notNullable().defaultTo("enabled");
    });
    await knex.raw(`
      ALTER TABLE "${TableName.KmsKey}"
      ADD CONSTRAINT "${KMS_KEY_STATUS_CONSTRAINT}"
      CHECK ("status" IN ('enabled', 'pending_import'))
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.KmsKey, "status")) {
    await knex.raw(`ALTER TABLE "${TableName.KmsKey}" DROP CONSTRAINT IF EXISTS "${KMS_KEY_STATUS_CONSTRAINT}"`);
    await knex.schema.alterTable(TableName.KmsKey, (t) => t.dropColumn("status"));
  }

  if (await knex.schema.hasColumn(TableName.KmsKey, "isImportable")) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => t.dropColumn("isImportable"));
  }

  if (await knex.schema.hasColumn(TableName.KmsKey, "importOnly")) {
    await knex.schema.alterTable(TableName.KmsKey, (t) => t.dropColumn("importOnly"));
  }
}
