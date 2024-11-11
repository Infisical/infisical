import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDisableBootstrapCertValidationCol = await knex.schema.hasColumn(
    TableName.CertificateTemplateEstConfig,
    "disableBootstrapCertValidation"
  );

  const hasCaChainCol = await knex.schema.hasColumn(TableName.CertificateTemplateEstConfig, "encryptedCaChain");

  await knex.schema.alterTable(TableName.CertificateTemplateEstConfig, (t) => {
    if (!hasDisableBootstrapCertValidationCol) {
      t.boolean("disableBootstrapCertValidation").defaultTo(false).notNullable();
    }

    if (hasCaChainCol) {
      t.binary("encryptedCaChain").nullable().alter();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasDisableBootstrapCertValidationCol = await knex.schema.hasColumn(
    TableName.CertificateTemplateEstConfig,
    "disableBootstrapCertValidation"
  );

  await knex.schema.alterTable(TableName.CertificateTemplateEstConfig, (t) => {
    if (hasDisableBootstrapCertValidationCol) {
      t.dropColumn("disableBootstrapCertValidation");
    }
  });
}
