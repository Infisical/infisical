import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secrets_v2_secret_value_org_blind_index
    ON ${TableName.SecretV2} ("secretValueOrgBlindIndex")
    WHERE "secretValueOrgBlindIndex" IS NOT NULL
  `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_secrets_v2_secret_value_org_blind_index`);

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }
}

// CONCURRENTLY requires running outside a transaction
const config = { transaction: false };
export { config };
