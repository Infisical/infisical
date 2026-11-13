import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.SecretScanningFinding)) &&
    !(await knex.schema.hasColumn(TableName.SecretScanningFinding, "secretFindingBlindIndex"))
  ) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      // org-level blind index of the secret value, generated like secrets_v2.secretValueOrgBlindIndex
      // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
      t.string("secretFindingBlindIndex", 64).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.SecretScanningFinding)) &&
    (await knex.schema.hasColumn(TableName.SecretScanningFinding, "secretFindingBlindIndex"))
  ) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.dropColumn("secretFindingBlindIndex");
    });
  }
}
