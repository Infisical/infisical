import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Add secretValueBlindIndex to secrets_v2
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
        t.string("secretValueBlindIndex", 64).nullable();
      });
    }
  }

  // Add secretValueBlindIndex to secret_versions_v2 for history tracking
  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.string("secretValueBlindIndex", 64).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.dropColumn("secretValueBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.dropColumn("secretValueBlindIndex");
      });
    }
  }
}
