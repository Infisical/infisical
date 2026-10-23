import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasEncryptedCredentials = await knex.schema.hasColumn(
    TableName.PkiCertificateInstallation,
    "encryptedCredentials"
  );
  if (!hasEncryptedCredentials) {
    await knex.schema.table(TableName.PkiCertificateInstallation, (table) => {
      table.binary("encryptedCredentials").nullable();
    });
  }

  const hasLastScanMessage = await knex.schema.hasColumn(TableName.PkiDiscoveryConfig, "lastScanMessage");
  if (hasLastScanMessage) {
    await knex.schema.alterTable(TableName.PkiDiscoveryConfig, (table) => {
      table.text("lastScanMessage").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLastScanMessage = await knex.schema.hasColumn(TableName.PkiDiscoveryConfig, "lastScanMessage");
  if (hasLastScanMessage) {
    await knex.raw(
      `UPDATE ?? SET "lastScanMessage" = LEFT("lastScanMessage", 255) WHERE LENGTH("lastScanMessage") > 255`,
      [TableName.PkiDiscoveryConfig]
    );
    await knex.schema.alterTable(TableName.PkiDiscoveryConfig, (table) => {
      table.string("lastScanMessage", 255).nullable().alter();
    });
  }

  const hasEncryptedCredentials = await knex.schema.hasColumn(
    TableName.PkiCertificateInstallation,
    "encryptedCredentials"
  );
  if (hasEncryptedCredentials) {
    await knex.schema.table(TableName.PkiCertificateInstallation, (table) => {
      table.dropColumn("encryptedCredentials");
    });
  }
}
