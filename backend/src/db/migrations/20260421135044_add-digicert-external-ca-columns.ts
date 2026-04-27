import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCertificateRequests = await knex.schema.hasTable(TableName.CertificateRequests);
  if (hasCertificateRequests) {
    const hasEncryptedPrivateKey = await knex.schema.hasColumn(TableName.CertificateRequests, "encryptedPrivateKey");
    if (!hasEncryptedPrivateKey) {
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.binary("encryptedPrivateKey").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCertificateRequests = await knex.schema.hasTable(TableName.CertificateRequests);
  if (hasCertificateRequests) {
    const hasEncryptedPrivateKey = await knex.schema.hasColumn(TableName.CertificateRequests, "encryptedPrivateKey");
    if (hasEncryptedPrivateKey) {
      await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
        t.dropColumn("encryptedPrivateKey");
      });
    }
  }
}
