import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.InternalCertificateAuthority);
  if (!hashtable) return;

  const hasCrlUrls = await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "crlDistributionPointUrls");

  if (!hasCrlUrls) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.specificType("crlDistributionPointUrls", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.InternalCertificateAuthority);
  if (!hashtable) return;

  const hasCrlUrls = await knex.schema.hasColumn(TableName.InternalCertificateAuthority, "crlDistributionPointUrls");

  if (hasCrlUrls) {
    await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
      t.dropColumn("crlDistributionPointUrls");
    });
  }
}
