import { Knex } from "knex";

import { CertKeyUsage } from "@app/services/certificate/certificate-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKeyUsagesCol = await knex.schema.hasColumn(TableName.CertificateTemplate, "keyUsages");
  const hasExtendedKeyUsagesCol = await knex.schema.hasColumn(TableName.CertificateTemplate, "extendedKeyUsages");

  await knex.schema.alterTable(TableName.CertificateTemplate, (tb) => {
    if (!hasKeyUsagesCol) {
      tb.specificType("keyUsages", "text[]");
    }

    if (!hasExtendedKeyUsagesCol) {
      tb.specificType("extendedKeyUsages", "text[]");
    }
  });

  if (!hasKeyUsagesCol) {
    await knex(TableName.CertificateTemplate).update({
      keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT]
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKeyUsagesCol = await knex.schema.hasColumn(TableName.CertificateTemplate, "keyUsages");
  const hasExtendedKeyUsagesCol = await knex.schema.hasColumn(TableName.CertificateTemplate, "extendedKeyUsages");

  await knex.schema.alterTable(TableName.CertificateTemplate, (t) => {
    if (hasKeyUsagesCol) {
      t.dropColumn("keyUsages");
    }
    if (hasExtendedKeyUsagesCol) {
      t.dropColumn("extendedKeyUsages");
    }
  });
}
