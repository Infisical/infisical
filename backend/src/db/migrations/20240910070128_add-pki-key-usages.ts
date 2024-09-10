import { Knex } from "knex";

import { CertKeyUsage } from "@app/services/certificate/certificate-types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Certificate template
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

  if (!hasExtendedKeyUsagesCol) {
    await knex(TableName.CertificateTemplate).update({
      extendedKeyUsages: []
    });
  }

  // Certificate
  const doesCertTableHaveKeyUsages = await knex.schema.hasColumn(TableName.Certificate, "keyUsages");
  const doesCertTableHaveExtendedKeyUsages = await knex.schema.hasColumn(TableName.Certificate, "extendedKeyUsages");
  await knex.schema.alterTable(TableName.Certificate, (tb) => {
    if (!doesCertTableHaveKeyUsages) {
      tb.specificType("keyUsages", "text[]");
    }

    if (!doesCertTableHaveExtendedKeyUsages) {
      tb.specificType("extendedKeyUsages", "text[]");
    }
  });

  if (!doesCertTableHaveKeyUsages) {
    await knex(TableName.Certificate).update({
      keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT]
    });
  }

  if (!doesCertTableHaveExtendedKeyUsages) {
    await knex(TableName.Certificate).update({
      extendedKeyUsages: []
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Certificate Template
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

  // Certificate
  const doesCertTableHaveKeyUsages = await knex.schema.hasColumn(TableName.Certificate, "keyUsages");
  const doesCertTableHaveExtendedKeyUsages = await knex.schema.hasColumn(TableName.Certificate, "extendedKeyUsages");
  await knex.schema.alterTable(TableName.Certificate, (t) => {
    if (doesCertTableHaveKeyUsages) {
      t.dropColumn("keyUsages");
    }
    if (doesCertTableHaveExtendedKeyUsages) {
      t.dropColumn("extendedKeyUsages");
    }
  });
}
