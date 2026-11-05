import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretScanningFinding)) {
    const hasBlindIndex = await knex.schema.hasColumn(TableName.SecretScanningFinding, "secretFindingBlindIndex");
    const hasEncryptedValue = await knex.schema.hasColumn(TableName.SecretScanningFinding, "encryptedSecretValue");

    if (!hasBlindIndex || !hasEncryptedValue) {
      await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
        // org-level blind index of the secret value, generated like secrets_v2.secretValueOrgBlindIndex
        // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
        if (!hasBlindIndex) t.string("secretFindingBlindIndex", 64).nullable();
        // the secret value, encrypted with the project's secret manager key
        if (!hasEncryptedValue) t.binary("encryptedSecretValue").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretScanningFinding)) {
    const hasBlindIndex = await knex.schema.hasColumn(TableName.SecretScanningFinding, "secretFindingBlindIndex");
    const hasEncryptedValue = await knex.schema.hasColumn(TableName.SecretScanningFinding, "encryptedSecretValue");

    if (hasBlindIndex || hasEncryptedValue) {
      await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
        if (hasBlindIndex) t.dropColumn("secretFindingBlindIndex");
        if (hasEncryptedValue) t.dropColumn("encryptedSecretValue");
      });
    }
  }
}
